import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SourceMapConsumer } from 'source-map';

export type SymbolicateOptions = {
  errorFile?: string;
  url?: string;
  sourceMap?: string;
  buildSourceMaps?: boolean;
  platform?: string;
};

export type ProjectType = 'expo' | 'bare-rn';

export type StackFrame = {
  fnName: string;
  file: string;
  line: number;
  col: number;
  raw: string;
};

// ---------------------------------------------------------------------------
// Project detection
// ---------------------------------------------------------------------------

export function detectProjectType(projectRoot: string): ProjectType {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(
      'Could not detect React Native project type. Run from your project root.'
    );
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
  throw new Error(
    'Could not detect React Native project type. Run from your project root.'
  );
}

// ---------------------------------------------------------------------------
// Stack frame parsing
// ---------------------------------------------------------------------------

export function parseStackFrames(errorText: string): StackFrame[] {
  const frames: StackFrame[] = [];
  // Matches:  at <fnName> (<file>:<line>:<col>)
  const re = /^\s+at\s+(\S+)\s+\(([^)]+):(\d+):(\d+)\)\s*$/gm;
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
// Source map discovery
// ---------------------------------------------------------------------------

export function discoverSourceMaps(projectRoot: string, projectType: ProjectType): string[] {
  const maps: string[] = [];

  if (projectType === 'expo') {
    const base = path.join(projectRoot, 'dist/_expo/static/js');
    for (const plat of ['ios', 'android']) {
      const dir = path.join(base, plat);
      if (fs.existsSync(dir)) {
        fs.readdirSync(dir)
          .filter((f) => f.endsWith('.map'))
          .forEach((f) => maps.push(path.join(dir, f)));
      }
    }
  } else {
    // Bare RN Android
    const androidDir = path.join(
      projectRoot,
      'android/app/build/generated/sourcemaps/react/release'
    );
    if (fs.existsSync(androidDir)) {
      fs.readdirSync(androidDir)
        .filter((f) => f.endsWith('.map'))
        .forEach((f) => maps.push(path.join(androidDir, f)));
    }
    // Bare RN iOS
    const iosDir = path.join(
      projectRoot,
      'ios/build/Build/Products/Release-iphonesimulator'
    );
    if (fs.existsSync(iosDir)) {
      fs.readdirSync(iosDir)
        .filter((f) => f.endsWith('.map'))
        .forEach((f) => maps.push(path.join(iosDir, f)));
    }
  }

  // .sherlo-cache
  const cacheDir = path.join(projectRoot, '.sherlo-cache');
  if (fs.existsSync(cacheDir)) {
    fs.readdirSync(cacheDir)
      .filter((f) => f.endsWith('.map'))
      .forEach((f) => maps.push(path.join(cacheDir, f)));
  }

  return maps;
}

export function pickSourceMap(
  maps: string[],
  errorText: string,
  platform: string | undefined
): string {
  // Extract bundle filename from error text
  const bundleMatch = errorText.match(/([^\s/)]+\.(?:jsbundle|bundle))/);
  const bundleBasename = bundleMatch ? bundleMatch[1].replace(/\.map$/, '') : null;

  let candidates = maps;

  // Filter by bundle name if we found one
  if (bundleBasename) {
    const byBundle = maps.filter((m) => path.basename(m).startsWith(bundleBasename));
    if (byBundle.length > 0) candidates = byBundle;
  }

  // Filter by platform hint
  if (platform) {
    const byPlatform = candidates.filter((m) => m.includes(platform));
    if (byPlatform.length > 0) candidates = byPlatform;
  }

  if (candidates.length === 0) {
    throw new Error(
      'No source map found. Run with --build-source-maps to generate one, or pass --source-map <path>.'
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `Multiple source maps found:\n${candidates.map((m) => '  ' + m).join('\n')}\nUse --platform <ios|android> to disambiguate, or pass --source-map <path>.`
    );
  }
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Source map build
// ---------------------------------------------------------------------------

export function buildSourceMaps(
  projectRoot: string,
  projectType: ProjectType,
  platform: string | undefined
): string {
  const plat = platform || 'ios';
  const cacheDir = path.join(projectRoot, '.sherlo-cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  console.log(chalk.dim('Building source maps... (this takes 30-60 seconds)'));

  try {
    if (projectType === 'expo') {
      execSync(
        `npx expo export --platform ${plat} --output-dir ${path.join(cacheDir, 'dist')}`,
        { cwd: projectRoot, stdio: 'inherit' }
      );
      // Discover the generated map
      const maps = discoverSourceMaps(projectRoot, projectType);
      const platMaps = maps.filter((m) => m.includes(plat));
      if (platMaps.length === 0) throw new Error('Build succeeded but no source map was found.');
      return platMaps[0];
    } else {
      const bundleOut = path.join(cacheDir, `bundle.${plat}.jsbundle`);
      const mapOut = `${bundleOut}.map`;
      execSync(
        `npx react-native bundle --platform ${plat} --dev false --entry-file index.js --bundle-output ${bundleOut} --sourcemap-output ${mapOut}`,
        { cwd: projectRoot, stdio: 'inherit' }
      );
      return mapOut;
    }
  } catch (err: any) {
    console.error(chalk.red('Source map build failed:'), err.message || String(err));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Symbolication
// ---------------------------------------------------------------------------

export type SymbolicatedFrame = {
  resolved: boolean;
  output: string;
};

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

async function symbolicate(options: SymbolicateOptions): Promise<void> {
  const projectRoot = process.cwd();

  // 1. Read error text
  let errorText: string;
  if (options.errorFile) {
    if (!fs.existsSync(options.errorFile)) {
      console.error(chalk.red(`Error: file not found: ${options.errorFile}`));
      process.exit(1);
    }
    errorText = fs.readFileSync(options.errorFile, 'utf8');
  } else if (options.url) {
    console.log(chalk.dim(`Fetching error from: ${options.url}`));
    const res = await fetch(options.url);
    if (!res.ok) {
      console.error(chalk.red(`Error: HTTP ${res.status} fetching ${options.url}`));
      process.exit(1);
    }
    errorText = await res.text();
  } else {
    console.error(chalk.red('Error: --error-file or --url is required.'));
    process.exit(1);
  }

  // 2. Project detection
  let projectType: ProjectType;
  try {
    projectType = detectProjectType(projectRoot);
  } catch (err: any) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }

  // 3. Resolve source map
  let sourceMapPath: string;
  if (options.sourceMap) {
    if (!fs.existsSync(options.sourceMap)) {
      console.error(chalk.red(`Error: source map not found: ${options.sourceMap}`));
      process.exit(1);
    }
    sourceMapPath = options.sourceMap;
  } else if (options.buildSourceMaps) {
    sourceMapPath = buildSourceMaps(projectRoot, projectType, options.platform);
  } else {
    const maps = discoverSourceMaps(projectRoot, projectType);
    try {
      sourceMapPath = pickSourceMap(maps, errorText, options.platform);
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  }

  // 4. Pre-flight git check
  try {
    const gitStatus = execSync('git status --porcelain', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
    if (gitStatus) {
      const fileCount = gitStatus.split('\n').length;
      console.log(
        chalk.yellow(
          `Warning: Your working tree has uncommitted changes (${fileCount} file${fileCount === 1 ? '' : 's'} modified). ` +
            `Source maps may misalign with the deployed bundle. Consider git stash before continuing.`
        )
      );
    }
  } catch (_) {
    // Not a git repo or git not available — skip
  }

  // 5. Parse frames
  const frames = parseStackFrames(errorText);
  if (frames.length === 0) {
    console.log(chalk.yellow('No stack frames found in error text.'));
    printOriginalError(errorText);
    return;
  }

  // 6. Symbolicate
  let symbolicatedFrames: SymbolicatedFrame[];
  try {
    symbolicatedFrames = await applySourceMap(frames, sourceMapPath);
  } catch (err: any) {
    console.error(chalk.red('Symbolication failed:'), err.message);
    process.exit(1);
  }

  // 7. Output
  printOriginalError(errorText);

  console.log(chalk.bold('\nSymbolicated stack:'));
  for (const frame of symbolicatedFrames) {
    if (frame.resolved) {
      console.log(chalk.green(frame.output));
    } else {
      console.log(chalk.yellow(frame.output));
    }
  }

  const resolvedCount = symbolicatedFrames.filter((f) => f.resolved).length;
  const resolvedPct = Math.round((resolvedCount / symbolicatedFrames.length) * 100);
  console.log(
    chalk.dim(`\n${resolvedCount}/${symbolicatedFrames.length} frames resolved (${resolvedPct}%)`)
  );
  if (resolvedPct < 50) {
    console.log(
      chalk.yellow(
        'Many frames did not resolve. Source maps may be from a different commit/build version.'
      )
    );
  }
}

function printOriginalError(errorText: string): void {
  const stackIdx = errorText.search(/^\s+at\s/m);
  const header = stackIdx > 0 ? errorText.slice(0, stackIdx).trimEnd() : '';
  if (header) {
    console.log(chalk.bold('\nOriginal error:'));
    console.log(header);
  }
}

export default symbolicate;
