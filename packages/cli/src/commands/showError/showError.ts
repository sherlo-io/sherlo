import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type ProjectType = 'expo' | 'rn';
export type Platform = 'ios' | 'android';

// ---------------------------------------------------------------------------
// Wire format types (js-error.json)
// ---------------------------------------------------------------------------

export interface ParsedFrame {
  fnName: string;
  file: string | null;
  line: number | null;
  col: number | null;
}

export interface JsErrorJson {
  name: string;
  message: string;
  stack: ParsedFrame[];
  componentStack: ParsedFrame[];
  digest: string | null;
  cause: { name: string; message: string; stack: ParsedFrame[] } | null;
  hasExpo: boolean;
  engine?: 'hermes' | 'jsc';
}

// ---------------------------------------------------------------------------
// Platform detection from frame file paths
// ---------------------------------------------------------------------------

export function detectPlatform(text: string): Platform {
  const isAndroid =
    /index\.android\.bundle/.test(text) ||
    /\/data\/user\/0\//.test(text) ||
    /data\/data\//.test(text);
  if (isAndroid) return 'android';

  const isIos =
    /\.jsbundle/.test(text) ||
    /CoreSimulator\/Devices/.test(text) ||
    /Library\/Application Support\/.expo-internal/.test(text);
  if (isIos) return 'ios';

  console.log(chalk.yellow('Warning: could not detect platform from frame paths, defaulting to ios.'));
  return 'ios';
}

// ---------------------------------------------------------------------------
// Bundler detection from native build scripts
// ---------------------------------------------------------------------------

export function parseIosBundleCommand(projectRoot: string): 'expo' | 'rn' | null {
  const iosDir = path.join(projectRoot, 'ios');
  if (!fs.existsSync(iosDir)) return null;
  let entries: string[];
  try { entries = fs.readdirSync(iosDir); } catch { return null; }
  const xcodeproj = entries.find(e => e.endsWith('.xcodeproj'));
  if (!xcodeproj) return null;
  const pbxprojPath = path.join(iosDir, xcodeproj, 'project.pbxproj');
  if (!fs.existsSync(pbxprojPath)) return null;
  let content: string;
  try { content = fs.readFileSync(pbxprojPath, 'utf8'); } catch { return null; }
  // Expo markers in the bundle shell script
  if (
    /BUNDLE_COMMAND=\\?"export:embed\\?"/.test(content) ||
    /expo\/scripts\/resolveAppEntry/.test(content) ||
    /CLI_PATH=[^\n]*@expo\/cli/.test(content)
  ) return 'expo';
  // RN marker: the standard react-native-xcode.sh is the bundle phase script for bare RN
  if (/react-native-xcode\.sh|Bundle React Native code/i.test(content)) return 'rn';
  return null;
}

export function parseAndroidBundleCommand(projectRoot: string): 'expo' | 'rn' | null {
  const buildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');
  if (!fs.existsSync(buildGradlePath)) return null;
  let content: string;
  try { content = fs.readFileSync(buildGradlePath, 'utf8'); } catch { return null; }
  const reactBlock = /\breact\s*\{([^}]*)\}/.exec(content);
  if (!reactBlock) return 'rn'; // legacy bare RN without react block defaults to react-native bundle
  const bundleCommand = /bundleCommand\s*=\s*"([^"]*)"/.exec(reactBlock[1]);
  if (!bundleCommand) return 'rn';
  return bundleCommand[1] === 'export:embed' ? 'expo' : 'rn';
}

export function detectBundler(projectRoot: string): ProjectType {
  const iosExists = fs.existsSync(path.join(projectRoot, 'ios'));
  const androidExists = fs.existsSync(path.join(projectRoot, 'android'));

  if (iosExists || androidExists) {
    const ios = iosExists ? parseIosBundleCommand(projectRoot) : null;
    const android = androidExists ? parseAndroidBundleCommand(projectRoot) : null;
    if (ios !== null && android !== null && ios !== android) {
      throw new Error(
        `iOS and Android bundle commands disagree: iOS='${ios}', Android='${android}'. ` +
        `Check ios/*.xcodeproj/project.pbxproj and android/app/build.gradle.`
      );
    }
    const result = ios ?? android;
    if (result !== null) return result;
    // Native dirs exist but no definitive signal — fall through to managed-Expo check
  }

  // Managed Expo / CNG: no native dirs (or dirs yielded no signal)
  let pkg: Record<string, any> = {};
  try { pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')); } catch { /* ignore */ }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const hasExpoDep = 'expo' in deps;
  const hasExpoConfig =
    fs.existsSync(path.join(projectRoot, 'app.config.js')) ||
    fs.existsSync(path.join(projectRoot, 'app.config.ts')) ||
    (() => {
      const appJsonPath = path.join(projectRoot, 'app.json');
      if (!fs.existsSync(appJsonPath)) return false;
      try { return 'expo' in JSON.parse(fs.readFileSync(appJsonPath, 'utf8')); } catch { return false; }
    })();

  if (hasExpoDep && hasExpoConfig) return 'expo';

  throw new Error(
    'Cannot determine bundler: no conclusive signal in native build scripts and project does not look like a managed Expo app. ' +
    'Run expo prebuild first or invoke sherlo show-error from a project root with ios/ or android/ directories.'
  );
}

// ---------------------------------------------------------------------------
// Entry file detection
// ---------------------------------------------------------------------------

export function detectEntryFile(projectRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    if (typeof pkg.main === 'string' && pkg.main.length > 0) return pkg.main;
  } catch { /* ignore */ }
  return 'index.js';
}

// ---------------------------------------------------------------------------
// Source map build
// ---------------------------------------------------------------------------

export function buildSourceMaps(
  projectRoot: string,
  projectType: ProjectType,
  platform: Platform
): string {
  const cacheDir = path.join(projectRoot, '.sherlo-cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const entryFile = detectEntryFile(projectRoot);

  const start = Date.now();
  process.stdout.write(chalk.dim('Building source maps...'));

  const tick = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000);
    process.stdout.write(chalk.dim(` ${elapsed}s`));
  }, 5000);

  let effectiveProjectType = projectType;

  try {
    if (projectType === 'expo') {
      // Use export:embed to produce the same plain-JS bundle as the deployed app.
      // 'expo export' (without :embed) produces Hermes bytecode (.hbc) whose source
      // map line:col coords don't match the plain JS bundle in the error stack.
      const bundleOut = path.join(cacheDir, `bundle.${platform}.js`);
      const mapOut = `${bundleOut}.map`;
      try {
        execSync(
          `npx expo export:embed --platform=${platform} --entry-file=${entryFile} --bundle-output=${bundleOut} --sourcemap-output=${mapOut} --dev=false --reset-cache`,
          { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] }
        );
      } catch (expoErr: any) {
        console.log(chalk.yellow(`\nWarning: expo build failed (${expoErr.message || String(expoErr)}), retrying with rn bundler...`));
        const rnBundleOut = path.join(cacheDir, `bundle.${platform}.jsbundle`);
        const rnMapOut = `${rnBundleOut}.map`;
        execSync(
          `npx react-native bundle --platform ${platform} --dev false --entry-file ${entryFile} --bundle-output ${rnBundleOut} --sourcemap-output ${rnMapOut}`,
          { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        effectiveProjectType = 'rn';
      }
    } else {
      const bundleOut = path.join(cacheDir, `bundle.${platform}.jsbundle`);
      const mapOut = `${bundleOut}.map`;
      execSync(
        `npx react-native bundle --platform ${platform} --dev false --entry-file ${entryFile} --bundle-output ${bundleOut} --sourcemap-output ${mapOut}`,
        { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] }
      );
    }
    clearInterval(tick);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    process.stdout.write(chalk.dim(` done (${elapsed}s)\n`));
  } catch (err: any) {
    clearInterval(tick);
    process.stdout.write('\n');
    throw new Error(`Source map build failed: ${err.message || String(err)}`);
  }

  return findSourceMap(projectRoot, effectiveProjectType, platform);
}

// ---------------------------------------------------------------------------
// Source map discovery
// ---------------------------------------------------------------------------

export function findSourceMap(
  projectRoot: string,
  projectType: ProjectType,
  platform: Platform
): string {
  if (projectType === 'expo') {
    // Primary: plain-JS map produced by expo export:embed
    const plainMap = path.join(projectRoot, '.sherlo-cache', `bundle.${platform}.js.map`);
    if (fs.existsSync(plainMap)) return plainMap;

    // Secondary: stale dist from old 'expo export' run — refuse if it's a .hbc.map
    const distDir = path.join(projectRoot, '.sherlo-cache', 'dist', '_expo', 'static', 'js', platform);
    if (fs.existsSync(distDir)) {
      const maps = fs.readdirSync(distDir).filter((f) => f.endsWith('.map'));
      if (maps.length > 0) {
        const mapFile = maps[0];
        if (mapFile.endsWith('.hbc.map')) {
          throw new Error(
            `Found Hermes bytecode source map (${mapFile}) which does not match the plain JS bundle in your error. ` +
            `Run sherlo show-error again to rebuild via 'expo export:embed'.`
          );
        }
        console.log(chalk.yellow(`Warning: using stale map from dist/ — may produce 0 resolved frames if it was built with 'expo export' (Hermes bytecode).`));
        return path.join(distDir, mapFile);
      }
    }

    throw new Error(
      `No source map found for ${platform}. ` +
      `Run 'npx expo export:embed --platform=${platform} --entry-file=index.js --bundle-output=.sherlo-cache/bundle.${platform}.js --sourcemap-output=.sherlo-cache/bundle.${platform}.js.map --dev=false' manually.`
    );
  } else {
    const mapPath = path.join(projectRoot, '.sherlo-cache', `bundle.${platform}.jsbundle.map`);
    if (fs.existsSync(mapPath)) return mapPath;
    throw new Error(`No source map found at ${mapPath}. Build may have failed.`);
  }
}

// ---------------------------------------------------------------------------
// metro-symbolicate shell-out
// ---------------------------------------------------------------------------

export function runMetroSymbolicate(
  frameLines: string[],
  sourceMapPath: string,
  projectRoot: string
): string[] {
  if (frameLines.length === 0) return [];
  const input = frameLines.join('\n');
  try {
    const result = execSync(`npx metro-symbolicate ${sourceMapPath}`, {
      cwd: projectRoot,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = result.toString().split('\n');
    // metro-symbolicate may output fewer or more lines; align by count
    return lines.slice(0, frameLines.length);
  } catch (err: any) {
    throw new Error(`metro-symbolicate failed: ${err.message || String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// metro-symbolicate output parser (internal)
// ---------------------------------------------------------------------------

// metro-symbolicate outputs frames in two formats:
//   standard:  at <fn> (<source>:<line>:<col>)       — colOrName is numeric
//   recovered: at <minFn> (<source>:<line>:<fnName>) — colOrName is a function name
// In both cases the source may have a leading "/" that should be stripped.
function reformatSymbolicatedLine(rawLine: string): string {
  const line = rawLine.trim();
  const m = /^at\s+(\S+)\s+\((.+):(\d+):([^):]+)\)$/.exec(line);
  if (!m) return line;
  const [, , source, lineNum, colOrName] = m;
  const cleanSource = source.replace(/^\//, '');
  if (/^\d+$/.test(colOrName)) {
    return `at ${m[1]} (${cleanSource}:${lineNum}:${colOrName})`;
  }
  // Function name in column position. metro-symbolicate does not emit the original source column
  // in this format — file:line is sufficient for navigation, so we leave col out.
  return `at ${colOrName} (${cleanSource}:${lineNum})`;
}

// ---------------------------------------------------------------------------
// Batch symbolication of ParsedFrame arrays
// ---------------------------------------------------------------------------

export type SymbolicateStats = {
  totalFrames: number;
  resolvedFrames: number;
};

export function symbolicateAllFrames(
  frames: ParsedFrame[],
  sourceMapPath: string,
  projectRoot: string
): { frames: ParsedFrame[] } & SymbolicateStats {
  const resolvableIndices: number[] = [];
  const inputLines: string[] = [];

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.file !== null && f.line !== null && f.col !== null) {
      resolvableIndices.push(i);
      inputLines.push(`    at ${f.fnName} (${f.file}:${f.line}:${f.col})`);
    }
  }

  const totalFrames = resolvableIndices.length;
  if (totalFrames === 0) return { frames: frames.map(f => ({ ...f })), totalFrames: 0, resolvedFrames: 0 };

  const symLines = runMetroSymbolicate(inputLines, sourceMapPath, projectRoot);

  const result = frames.map(f => ({ ...f }));
  let resolvedFrames = 0;

  for (let idx = 0; idx < resolvableIndices.length; idx++) {
    const frameIdx = resolvableIndices[idx];
    const rawSym = (symLines[idx] || '').trim();
    if (!rawSym) continue;

    const originalFile = frames[frameIdx].file!;
    if (rawSym.includes(originalFile)) continue; // not resolved — metro returned the same bundle path

    const reformatted = reformatSymbolicatedLine(rawSym);
    // Parse "at <fn> (<file>:<line>)" or "at <fn> (<file>:<line>:<col>)"
    const m = /^at\s+(\S+)\s+\((.+):(\d+)(?::(\d+))?\)$/.exec(reformatted);
    if (m) {
      result[frameIdx] = {
        fnName: m[1],
        file: m[2],
        line: parseInt(m[3], 10),
        col: m[4] !== undefined ? parseInt(m[4], 10) : null,
      };
      resolvedFrames++;
    }
  }

  return { frames: result, totalFrames, resolvedFrames };
}

// ---------------------------------------------------------------------------
// Output rendering
// ---------------------------------------------------------------------------

function renderFrame(frame: ParsedFrame): string {
  if (frame.file === null || frame.line === null) {
    return `  at ${frame.fnName} (<anonymous>)`;
  }
  if (frame.col !== null) {
    return `  at ${frame.fnName} (${frame.file}:${frame.line}:${frame.col})`;
  }
  return `  at ${frame.fnName} (${frame.file}:${frame.line})`;
}

export function renderOutput(data: JsErrorJson): string {
  const lines: string[] = [];

  // componentStack is not printed: production builds have mostly <anonymous> frames that can't
  // symbolicate, so the section adds noise without value. The data is preserved in the JSON.

  if (data.stack.length > 0) {
    lines.push('Stack trace:');
    for (const f of data.stack) lines.push(renderFrame(f));
  }

  if (data.cause) {
    if (lines.length > 0) lines.push('');
    lines.push(`Caused by: ${data.cause.name}: ${data.cause.message}`);
    for (const f of data.cause.stack) lines.push(renderFrame(f));
  }

  if (data.digest) {
    if (lines.length > 0) lines.push('');
    lines.push(`Digest: ${data.digest}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

async function showError(url: string): Promise<void> {
  const projectRoot = process.cwd();

  // 1. Fetch and parse JSON payload
  console.log(chalk.dim('Fetching error from Sherlo...'));
  let data: JsErrorJson;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    data = JSON.parse(text) as JsErrorJson;
  } catch (err: any) {
    console.error(chalk.red(`Failed to fetch error: ${err.message}`));
    process.exit(1);
  }

  // 2. Detect platform from frame file paths
  const allFilePaths = [...data.stack, ...data.componentStack]
    .map(f => f.file || '')
    .join('\n');
  const platform = detectPlatform(allFilePaths);
  console.log(chalk.dim(`Detected platform: ${platform}`));

  // 3. Detect bundler from native build scripts
  let projectType: ProjectType;
  try {
    projectType = detectBundler(projectRoot);
  } catch (err: any) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
  const engine = data.engine ?? 'hermes';
  console.log(chalk.dim(`Detected project type: ${projectType}`));
  console.log(chalk.dim(`Detected engine: ${engine}`));

  // 4. Pre-flight git check
  try {
    const gitStatus = execSync('git status --porcelain', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
    if (gitStatus) {
      const n = gitStatus.split('\n').length;
      console.log(chalk.yellow(
        `Warning: ${n} uncommitted file${n === 1 ? '' : 's'} in working tree. ` +
        `Source maps may misalign with the deployed bundle. Consider git stash first.`
      ));
    }
  } catch (_) {
    // not a git repo or git unavailable — skip
  }

  // 5. Build source maps
  let sourceMapPath: string;
  try {
    sourceMapPath = buildSourceMaps(projectRoot, projectType, platform);
  } catch (err: any) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }

  // 6. Print error header
  console.log(`\n${data.name}: ${data.message}`);

  // Only symbolicate stack + cause (componentStack is not printed, skip for speed and clean counts)
  const stackAndCause = [...data.stack, ...(data.cause?.stack ?? [])];
  const locatedCount = stackAndCause.filter(f => f.file !== null).length;
  if (locatedCount === 0) {
    console.log(chalk.yellow('No stack frames with location found in error payload.'));
    return;
  }

  // 7. Symbolicate stack + cause in a single batch
  const stackLen = data.stack.length;

  let symResult: ReturnType<typeof symbolicateAllFrames>;
  try {
    symResult = symbolicateAllFrames(stackAndCause, sourceMapPath, projectRoot);
  } catch (err: any) {
    console.error(chalk.red(`Symbolication failed: ${err.message}`));
    process.exit(1);
  }

  const { frames: symStackAndCause, totalFrames, resolvedFrames } = symResult;

  const outputData: JsErrorJson = {
    ...data,
    stack: symStackAndCause.slice(0, stackLen),
    cause: data.cause
      ? { ...data.cause, stack: symStackAndCause.slice(stackLen) }
      : null,
  };

  // 8. Print symbolicated sections + footer
  console.log('\n' + renderOutput(outputData));
  console.log(chalk.dim(`\nResolved ${resolvedFrames} of ${totalFrames} frames`));

  const pct = totalFrames > 0 ? Math.round((resolvedFrames / totalFrames) * 100) : 0;
  if (pct < 50) {
    console.log(chalk.yellow('Most frames did not resolve. Source maps may be from a different commit.'));
  }
}

export default showError;
