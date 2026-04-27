import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SourceMapConsumer } from 'source-map';

export type ProjectType = 'expo' | 'bare-rn';
export type Platform = 'ios' | 'android';

export type StackFrame = {
  fnName: string;
  file: string;
  line: number;
  col: number;
  raw: string;
};

export type SymbolicatedFrame = {
  resolved: boolean;
  output: string;
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
// Section parsing
// ---------------------------------------------------------------------------

// Known section headers in the js-error.txt format produced by Sherlo.
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
// Stack frame parsing (from a block of lines)
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

  const start = Date.now();
  process.stdout.write(chalk.dim('Building source maps...'));

  const tick = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000);
    process.stdout.write(chalk.dim(` ${elapsed}s`));
  }, 5000);

  const entryFile = detectEntryFile(projectRoot);

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

    // Secondary: stale dist from old 'expo export' run — warn if it's a .hbc.map
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
// Symbolication
// ---------------------------------------------------------------------------

export async function applySourceMap(
  frames: StackFrame[],
  sourceMapPath: string
): Promise<SymbolicatedFrame[]> {
  const rawMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));
  return SourceMapConsumer.with(rawMap, null, (consumer) => {
    return frames.map((frame) => {
      const pos = consumer.originalPositionFor({ line: frame.line, column: frame.col });
      if (pos.source && pos.line != null) {
        // Use mapped name when available; fall back to minified fn name.
        // Metro's minifier strips function names, so pos.name is often null —
        // the file path + line:col is still actionable without the function name.
        const name = pos.name || frame.fnName;
        const src = pos.source.replace(/^webpack:\/\/\//, '');
        return {
          resolved: true,
          output: `    at ${name} (${src}:${pos.line}:${pos.column ?? 0})`,
        };
      }
      return {
        resolved: false,
        output: `    [unresolved] ${frame.raw.trimStart()}`,
      };
    });
  });
}

// ---------------------------------------------------------------------------
// Section-aware symbolication
// ---------------------------------------------------------------------------

export async function symbolicateSections(
  sections: ErrorSection[],
  sourceMapPath: string
): Promise<string> {
  const rawMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));

  return SourceMapConsumer.with(rawMap, null, async (consumer) => {
    const outputParts: string[] = [];
    let totalFrames = 0;
    let resolvedFrames = 0;

    for (const section of sections) {
      if (section.header !== null) {
        outputParts.push(`${section.header}:`);
      }

      for (const line of section.lines) {
        const m = FRAME_RE.exec(line);
        if (!m) {
          outputParts.push(line);
          continue;
        }
        totalFrames++;
        const frame: StackFrame = {
          fnName: m[1],
          file: m[2],
          line: parseInt(m[3], 10),
          col: parseInt(m[4], 10),
          raw: line,
        };
        const pos = consumer.originalPositionFor({ line: frame.line, column: frame.col });
        if (pos.source && pos.line != null) {
          resolvedFrames++;
          const name = pos.name || frame.fnName;
          const src = pos.source.replace(/^webpack:\/\/\//, '');
          outputParts.push(chalk.green(`    at ${name} (${src}:${pos.line}:${pos.column ?? 0})`));
        } else {
          outputParts.push(chalk.yellow(`    [unresolved] ${line.trimStart()}`));
        }
      }
    }

    return JSON.stringify({ output: outputParts.join('\n'), totalFrames, resolvedFrames });
  });
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
  if (allFrames.length === 0) {
    console.log(chalk.yellow('No stack frames found in error text.'));
    printPreamble(sections);
    return;
  }

  // 7. Symbolicate with section structure preserved
  let symbolicatedJson: string;
  try {
    symbolicatedJson = await symbolicateSections(sections, sourceMapPath);
  } catch (err: any) {
    console.error(chalk.red(`Symbolication failed: ${err.message}`));
    process.exit(1);
  }

  const { output, totalFrames, resolvedFrames } = JSON.parse(symbolicatedJson) as {
    output: string;
    totalFrames: number;
    resolvedFrames: number;
  };

  // 8. Output
  printPreamble(sections);

  const pct = totalFrames > 0 ? Math.round((resolvedFrames / totalFrames) * 100) : 0;
  const headerColor = pct === 100 ? chalk.green : pct >= 50 ? chalk.yellow : chalk.red;
  console.log(headerColor.bold('\nSymbolicated output:'));
  console.log(output);

  console.log(chalk.dim(`\nResolved ${resolvedFrames} of ${totalFrames} frames`));
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
  if (text) {
    console.log(chalk.bold('\nOriginal error:'));
    console.log(text);
  }
}

export default showError;
