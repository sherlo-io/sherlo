import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { SbVersion } from './sb-version.js';

const INTEGRATION_TESTS_DIR = path.resolve(__dirname, '..');
const APPS_DIR = path.join(INTEGRATION_TESTS_DIR, 'apps');
const SB_VERSIONS_DIR = path.join(INTEGRATION_TESTS_DIR, 'sb-versions');
const VARIANTS_DIR = path.join(INTEGRATION_TESTS_DIR, 'variants');
const APP_SNAPSHOTS_DIR = path.join(INTEGRATION_TESTS_DIR, '.app');

const BASE_APP = 'integrated-app-bare-rn';

const HARD_COPY_ENTRIES = [
  'App.tsx',
  'index.js',
  'package.json',
  'babel.config.js',
  'metro.config.js',
  'tsconfig.json',
  'app.json',
  'app-meta.json',
  '.rnstorybook',
  'scripts',
  'src',
  '.yarnrc.yml',
  'yarn.lock',
];

function walkFiles(root: string, dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(root, abs));
    } else if (entry.isFile()) {
      results.push(path.relative(root, abs));
    }
  }
  return results;
}

function copyDirContents(src: string, dest: string): void {
  for (const rel of walkFiles(src, src)) {
    const srcPath = path.join(src, rel);
    const destPath = path.join(dest, rel);
    mkdirSync(path.dirname(destPath), { recursive: true });
    copyFileSync(srcPath, destPath);
  }
}

function mergePackageJsonPartial(materializedDir: string): void {
  const partialPath = path.join(materializedDir, 'package.json.partial');
  if (!existsSync(partialPath)) return;
  const partial = JSON.parse(readFileSync(partialPath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const pkgPath = path.join(materializedDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  pkg.dependencies = { ...pkg.dependencies, ...(partial.dependencies ?? {}) };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  unlinkSync(partialPath);
}

function applyOverlay(overlayDir: string, destDir: string, skipFiles?: string[]): void {
  const skip = new Set(skipFiles ?? []);
  for (const rel of walkFiles(overlayDir, overlayDir)) {
    if (skip.has(rel)) continue;
    const srcPath = path.join(overlayDir, rel);
    const destPath = path.join(destDir, rel);
    mkdirSync(path.dirname(destPath), { recursive: true });
    copyFileSync(srcPath, destPath);
  }
}

export function materializeApp(sbVersion: SbVersion, variantName?: string): string {
  const comboName = `${sbVersion}__${variantName ?? 'base'}`;
  const materializedDir = path.join(APP_SNAPSHOTS_DIR, comboName);
  const baseAppDir = path.join(APPS_DIR, BASE_APP);

  if (existsSync(materializedDir)) {
    rmSync(materializedDir, { force: true, recursive: true });
  }
  mkdirSync(materializedDir, { recursive: true });

  // Hard-copy top-level entries from the base app
  for (const entry of HARD_COPY_ENTRIES) {
    const src = path.join(baseAppDir, entry);
    if (!existsSync(src)) continue;
    const dest = path.join(materializedDir, entry);
    if (statSync(src).isDirectory()) {
      copyDirContents(src, dest);
    } else {
      copyFileSync(src, dest);
    }
  }

  // Symlink heavy/native dirs using relative targets so the snapshot is portable
  for (const entry of ['node_modules', 'android', 'ios', '.yarn']) {
    const linkPath = path.join(materializedDir, entry);
    const relTarget = path.join('..', '..', 'apps', BASE_APP, entry);
    symlinkSync(relTarget, linkPath);
  }

  // Apply sb-version overlay (copies all files verbatim, overwriting duplicates)
  const sbVersionDir = path.join(SB_VERSIONS_DIR, sbVersion);
  applyOverlay(sbVersionDir, materializedDir);

  // Apply variant overlay (skip variant.json itself)
  if (variantName) {
    const variantDir = path.join(VARIANTS_DIR, variantName);
    applyOverlay(variantDir, materializedDir, ['variant.json']);

    const variantJsonPath = path.join(variantDir, 'variant.json');
    if (existsSync(variantJsonPath)) {
      const config = JSON.parse(readFileSync(variantJsonPath, 'utf8')) as {
        scripts?: { prepare?: string };
      };
      if (config.scripts?.prepare) {
        const scriptAbs = path.resolve(variantDir, config.scripts.prepare);
        try {
          chmodSync(scriptAbs, 0o755);
        } catch {
          // ignore - may already be executable
        }
        execFileSync(scriptAbs, [], { cwd: materializedDir, stdio: 'inherit' });
      }
    }
  }

  mergePackageJsonPartial(materializedDir);

  execFileSync('yarn', ['storybook:generate'], { cwd: materializedDir, stdio: 'inherit' });

  return materializedDir;
}
