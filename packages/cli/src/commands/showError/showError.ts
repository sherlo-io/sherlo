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
// Stack frame parsing
// ---------------------------------------------------------------------------

export function parseStackFrames(errorText: string): StackFrame[] {
  const frames: StackFrame[] = [];
  // Matches variable indent: one or more spaces then "at <fn> (<file>:<line>:<col>)"
  const re = /^[ \t]+at\s+(\S+)\s+\(([^)]+):(\d+):(\d+)\)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(errorText)) !== null) {
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

  const start = Date.now();
  process.stdout.write(chalk.dim('Building source maps...'));

  const tick = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000);
    process.stdout.write(chalk.dim(` ${elapsed}s`));
  }, 5000);

  try {
    if (projectType === 'expo') {
      const distDir = path.join(cacheDir, 'dist');
      execSync(
        `npx expo export --platform ${platform} --output-dir ${distDir}`,
        { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } else {
      const bundleOut = path.join(cacheDir, `bundle.${platform}.jsbundle`);
      const mapOut = `${bundleOut}.map`;
      execSync(
        `npx react-native bundle --platform ${platform} --dev false --entry-file index.js --bundle-output ${bundleOut} --sourcemap-output ${mapOut}`,
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
    const dir = path.join(projectRoot, '.sherlo-cache', 'dist', '_expo', 'static', 'js', platform);
    if (fs.existsSync(dir)) {
      const maps = fs.readdirSync(dir).filter((f) => f.endsWith('.map'));
      if (maps.length > 0) return path.join(dir, maps[0]);
    }
    // Fallback: dist/_expo/static/js/<platform>
    const distDir = path.join(projectRoot, 'dist', '_expo', 'static', 'js', platform);
    if (fs.existsSync(distDir)) {
      const maps = fs.readdirSync(distDir).filter((f) => f.endsWith('.map'));
      if (maps.length > 0) return path.join(distDir, maps[0]);
    }
    throw new Error(`No source map found for ${platform} in .sherlo-cache/dist. Build may have failed.`);
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

  // 6. Parse frames
  const frames = parseStackFrames(errorText);
  if (frames.length === 0) {
    console.log(chalk.yellow('No stack frames found in error text.'));
    printErrorHeader(errorText);
    return;
  }

  // 7. Symbolicate
  let symbolicated: SymbolicatedFrame[];
  try {
    symbolicated = await applySourceMap(frames, sourceMapPath);
  } catch (err: any) {
    console.error(chalk.red(`Symbolication failed: ${err.message}`));
    process.exit(1);
  }

  // 8. Output
  printErrorHeader(errorText);

  const resolvedCount = symbolicated.filter((f) => f.resolved).length;
  const pct = Math.round((resolvedCount / symbolicated.length) * 100);
  const headerColor = pct === 100 ? chalk.green : pct >= 50 ? chalk.yellow : chalk.red;

  console.log(headerColor.bold('\nSymbolicated stack:'));
  for (const frame of symbolicated) {
    console.log(frame.resolved ? chalk.green(frame.output) : chalk.yellow(frame.output));
  }

  console.log(chalk.dim(`\nResolved ${resolvedCount} of ${symbolicated.length} frames`));
  if (pct < 50) {
    console.log(
      chalk.yellow('Most frames did not resolve. Source maps may be from a different commit.')
    );
  }
}

function printErrorHeader(errorText: string): void {
  const stackIdx = errorText.search(/^[ \t]+at\s/m);
  const header = stackIdx > 0 ? errorText.slice(0, stackIdx).trimEnd() : '';
  if (header) {
    console.log(chalk.bold('\nOriginal error:'));
    console.log(header);
  }
}

export default showError;
