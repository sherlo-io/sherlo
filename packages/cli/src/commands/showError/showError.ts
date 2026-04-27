import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type ProjectType = 'expo' | 'bare-rn';
export type Platform = 'ios' | 'android';

export type StackFrame = {
  fnName: string;
  file: string;
  line: number;
  col: number;
  raw: string;
};

export type ErrorSection = {
  header: string | null; // null = preamble (error message before first section)
  lines: string[];       // raw lines (including frame lines)
};

// ---------------------------------------------------------------------------
// Platform detection from error content
// ---------------------------------------------------------------------------

export function detectPlatform(errorText: string): Platform {
  const isAndroid =
    /index\.android\.bundle/.test(errorText) ||
    /\/data\/user\/0\//.test(errorText) ||
    /data\/data\//.test(errorText);
  if (isAndroid) return 'android';

  const isIos =
    /\.jsbundle/.test(errorText) ||
    /CoreSimulator\/Devices/.test(errorText) ||
    /Library\/Application Support\/.expo-internal/.test(errorText);
  if (isIos) return 'ios';

  console.log(chalk.yellow('Warning: could not detect platform from error content, defaulting to ios.'));
  return 'ios';
}

// ---------------------------------------------------------------------------
// Project type detection
// ---------------------------------------------------------------------------

export function detectProjectType(projectRoot: string): ProjectType {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error('Run from your React Native project root');
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = {
    ...((pkg.dependencies as Record<string, string>) || {}),
    ...((pkg.devDependencies as Record<string, string>) || {}),
  };

  const hasExpo =
    'expo' in deps ||
    fs.existsSync(path.join(projectRoot, 'app.json')) ||
    fs.existsSync(path.join(projectRoot, 'app.config.js')) ||
    fs.existsSync(path.join(projectRoot, 'app.config.ts'));
  if (hasExpo) return 'expo';

  if ('react-native' in deps) return 'bare-rn';

  throw new Error('Run from your React Native project root');
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
// Section parsing
// ---------------------------------------------------------------------------

const SECTION_HEADER_RE = /^(Component tree|Stack trace|Caused by:[^\n]*):\s*$/;

export function parseErrorSections(errorText: string): ErrorSection[] {
  const lines = errorText.split('\n');
  const sections: ErrorSection[] = [];
  let current: ErrorSection = { header: null, lines: [] };

  for (const line of lines) {
    if (SECTION_HEADER_RE.test(line.trim())) {
      sections.push(current);
      current = { header: line.trim().replace(/:$/, ''), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  return sections;
}

// ---------------------------------------------------------------------------
// Stack frame parsing
// ---------------------------------------------------------------------------

const FRAME_RE = /^[ \t]+at\s+(\S+)\s+\(([^)]+):(\d+):(\d+)\)\s*$/;

export function parseStackFrames(text: string): StackFrame[] {
  const frames: StackFrame[] = [];
  const re = new RegExp(FRAME_RE.source, 'gm');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    frames.push({
      fnName: m[1],
      file: m[2],
      line: parseInt(m[3], 10),
      col: parseInt(m[4], 10),
      raw: m[0],
    });
  }
  return frames;
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

  try {
    if (projectType === 'expo') {
      // Use export:embed to produce the same plain-JS bundle as the deployed app.
      // 'expo export' (without :embed) produces Hermes bytecode (.hbc) whose source
      // map line:col coords don't match the plain JS bundle in the error stack.
      const bundleOut = path.join(cacheDir, `bundle.${platform}.js`);
      const mapOut = `${bundleOut}.map`;
      execSync(
        `npx expo export:embed --platform=${platform} --entry-file=${entryFile} --bundle-output=${bundleOut} --sourcemap-output=${mapOut} --dev=false --reset-cache`,
        { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] }
      );
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

  return findSourceMap(projectRoot, projectType, platform);
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
// metro-symbolicate output parser
// ---------------------------------------------------------------------------

// metro-symbolicate outputs frames in two formats:
//   standard:  at <fn> (<source>:<line>:<col>)       — colOrName is numeric
//   recovered: at <minFn> (<source>:<line>:<fnName>) — colOrName is a function name
// In both cases the source may have a leading "/" that should be stripped.
export function reformatSymbolicatedLine(rawLine: string): string {
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
// Section-aware symbolication via metro-symbolicate
// ---------------------------------------------------------------------------

export type SymbolicateResult = {
  output: string;
  totalFrames: number;
  resolvedFrames: number;
};

export function symbolicateSections(
  sections: ErrorSection[],
  sourceMapPath: string,
  projectRoot: string
): SymbolicateResult {
  // Collect all frame lines across non-preamble sections, in order
  type FrameRef = { sectionIdx: number; lineIdx: number; originalFile: string };
  const frameRefs: FrameRef[] = [];
  const frameInputLines: string[] = [];

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    if (section.header === null) continue; // skip preamble — printed separately
    for (let li = 0; li < section.lines.length; li++) {
      const m = FRAME_RE.exec(section.lines[li]);
      if (m) {
        frameRefs.push({ sectionIdx: si, lineIdx: li, originalFile: m[2] });
        frameInputLines.push(`    at ${m[1]} (${m[2]}:${m[3]}:${m[4]})`);
      }
    }
  }

  const symbolicatedLines = runMetroSymbolicate(frameInputLines, sourceMapPath, projectRoot);

  // Rebuild sections with symbolicated frames, 2-space indent throughout
  const outputLines: string[] = [];
  let totalFrames = 0;
  let resolvedFrames = 0;
  let frameIdx = 0;
  let firstSection = true;

  for (const section of sections) {
    if (section.header === null) continue; // skip preamble

    if (!firstSection) outputLines.push('');
    firstSection = false;

    outputLines.push(`${section.header}:`);
    for (const line of section.lines) {
      const m = FRAME_RE.exec(line);
      if (!m) {
        // Lines starting with 'at ' (e.g. anonymous frames) get 2-space indent; others pass through.
        const trimmed = line.replace(/^\s+/, '');
        if (trimmed.startsWith('at ')) {
          outputLines.push(`  ${trimmed}`);
        } else if (trimmed !== '') {
          outputLines.push(line);
        }
        continue;
      }

      totalFrames++;
      const symLine = (symbolicatedLines[frameIdx] || '').trim();
      frameIdx++;

      const originalFile = m[2];
      const resolved = symLine.length > 0 && !symLine.includes(originalFile);
      if (resolved) resolvedFrames++;

      // Strip any leading whitespace from the frame text before adding our fixed 2-space indent,
      // so both symbolicated and unresolved frames are uniformly indented.
      const frameText = resolved
        ? reformatSymbolicatedLine(symLine)
        : `at ${m[1]} (${m[2]}:${m[3]}:${m[4]})`;
      outputLines.push(`  ${frameText.trimStart()}`);
    }
  }

  return { output: outputLines.join('\n'), totalFrames, resolvedFrames };
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

async function showError(url: string): Promise<void> {
  const projectRoot = process.cwd();

  // 1. Fetch error text
  console.log(chalk.dim(`Fetching error from Sherlo...`));
  let errorText: string;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    errorText = await res.text();
  } catch (err: any) {
    console.error(chalk.red(`Failed to fetch error: ${err.message}`));
    process.exit(1);
  }

  // 2. Detect platform
  const platform = detectPlatform(errorText);
  console.log(chalk.dim(`Detected platform: ${platform}`));

  // 3. Detect project type
  let projectType: ProjectType;
  try {
    projectType = detectProjectType(projectRoot);
  } catch (err: any) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
  console.log(chalk.dim(`Detected project type: ${projectType}`));

  // 4. Pre-flight git check
  try {
    const gitStatus = execSync('git status --porcelain', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
    if (gitStatus) {
      const n = gitStatus.split('\n').length;
      console.log(
        chalk.yellow(
          `Warning: ${n} uncommitted file${n === 1 ? '' : 's'} in working tree. ` +
            `Source maps may misalign with the deployed bundle. Consider git stash first.`
        )
      );
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

  // 6. Parse sections
  const sections = parseErrorSections(errorText);
  const allFrames = parseStackFrames(errorText);

  // 7. Print preamble (error message) — exactly once
  printPreamble(sections);

  if (allFrames.length === 0) {
    console.log(chalk.yellow('No stack frames found in error text.'));
    return;
  }

  // 8. Symbolicate with section structure preserved
  let result: SymbolicateResult;
  try {
    result = symbolicateSections(sections, sourceMapPath, projectRoot);
  } catch (err: any) {
    console.error(chalk.red(`Symbolication failed: ${err.message}`));
    process.exit(1);
  }

  // 9. Print symbolicated sections
  const { output, totalFrames, resolvedFrames } = result;
  console.log('\n' + output);
  console.log(chalk.dim(`\nResolved ${resolvedFrames} of ${totalFrames} frames`));

  const pct = totalFrames > 0 ? Math.round((resolvedFrames / totalFrames) * 100) : 0;
  if (pct < 50) {
    console.log(
      chalk.yellow('Most frames did not resolve. Source maps may be from a different commit.')
    );
  }
}

function printPreamble(sections: ErrorSection[]): void {
  const preamble = sections.find((s) => s.header === null);
  if (!preamble) return;
  const text = preamble.lines.join('\n').trimEnd();
  if (text) console.log('\n' + text);
}

export default showError;
