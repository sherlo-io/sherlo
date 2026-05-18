import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { SbVersion } from './sb-version.js';

const INTEGRATION_TESTS_DIR = path.resolve(__dirname, '..');
const APPS_DIR = path.join(INTEGRATION_TESTS_DIR, 'apps');
const VARIANTS_DIR = path.join(INTEGRATION_TESTS_DIR, 'variants');

function appDir(appName: string): string {
  return path.join(APPS_DIR, appName);
}

function manifestPath(appName: string): string {
  return path.join(appDir(appName), '.applied-variant.json');
}

function backupDir(appName: string): string {
  return path.join(appDir(appName), '.variant-backups');
}

interface ManifestFile {
  path: string;
  mode: 'created' | 'overwrote';
  backupPath?: string;
}

interface Manifest {
  variantName: string;
  files: ManifestFile[];
}

function walkVariantFiles(variantRoot: string, current: string, out: string[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const abs = path.join(current, entry.name);
    if (entry.isDirectory()) {
      walkVariantFiles(variantRoot, abs, out);
    } else if (entry.isFile()) {
      out.push(path.relative(variantRoot, abs));
    }
  }
}

function runStorybookGenerate(appName: string): void {
  const dir = appDir(appName);
  const pkgJson = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const scripts = pkgJson.scripts ?? {};
  const scriptName = ['storybook-generate', 'storybook:generate', 'sb-rn-get-stories'].find(
    s => s in scripts,
  );
  if (!scriptName) {
    throw new Error(`No storybook generator script found in '${appName}' package.json scripts`);
  }
  execFileSync('yarn', [scriptName], { cwd: dir, stdio: 'inherit' });
}

export function listVariants(): string[] {
  if (!existsSync(VARIANTS_DIR)) return [];
  return readdirSync(VARIANTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

export class VariantIncompatibleError extends Error {
  constructor(
    public variantName: string,
    public sbVersion: SbVersion,
    public compatibleWith: string[],
  ) {
    super(
      `Variant '${variantName}' is not compatible with ${sbVersion}. Compatible sb-versions: ${compatibleWith.join(', ')}.`,
    );
    this.name = 'VariantIncompatibleError';
  }
}

/**
 * Check if a variant is compatible with a given Storybook version.
 * Reads compatibleWith from variant.json and matches against sbVersion (e.g. 'sb10').
 */
export function isVariantCompatible(variantName: string, sbVersion: SbVersion): boolean {
  const variantJson = path.join(VARIANTS_DIR, variantName, 'variant.json');
  if (!existsSync(variantJson)) return true;
  const config = JSON.parse(readFileSync(variantJson, 'utf8')) as {
    compatibleWith?: string[];
    scripts?: { prepare?: string; cleanup?: string };
  };
  const { compatibleWith } = config;
  if (!compatibleWith || compatibleWith.length === 0) return true;
  return compatibleWith.includes(sbVersion);
}

function readVariantConfig(variantDir: string): {
  compatibleWith?: string[];
  scripts?: { prepare?: string; cleanup?: string };
} {
  const variantJson = path.join(variantDir, 'variant.json');
  if (!existsSync(variantJson)) return {};
  return JSON.parse(readFileSync(variantJson, 'utf8')) as {
    compatibleWith?: string[];
    scripts?: { prepare?: string; cleanup?: string };
  };
}

/**
 * Run a variant's prepare script (variant.json scripts.prepare) with cwd = appDir.
 * Makes the script executable first. Throws if the script exits non-zero.
 *
 * NOTE: prepare scripts may mutate node_modules (e.g. patch sdk-compatibility.json).
 * These mutations persist until sync-sdk is re-run manually between variant switches.
 */
function runPrepareScript(variantDir: string, destDir: string, scriptRelPath: string): void {
  const scriptAbs = path.resolve(variantDir, scriptRelPath);
  if (!existsSync(scriptAbs)) {
    throw new Error(`Variant prepare script not found: ${scriptAbs}`);
  }
  try {
    chmodSync(scriptAbs, 0o755);
  } catch {
    // ignore - may already be executable
  }
  execFileSync(scriptAbs, [], { cwd: destDir, stdio: 'inherit' });
}

export function applyVariant(appName: string, variantName: string): void {
  const variantDir = path.join(VARIANTS_DIR, variantName);
  if (!existsSync(variantDir)) {
    throw new Error(`Variant '${variantName}' does not exist at ${variantDir}`);
  }

  if (existsSync(manifestPath(appName))) {
    resetFixture(appName, { skipGenerate: true });
  }

  const relFiles: string[] = [];
  walkVariantFiles(variantDir, variantDir, relFiles);
  const filteredFiles = relFiles.filter(f => f !== 'variant.json');

  const dest = appDir(appName);
  const backupRoot = backupDir(appName);
  const manifestFiles: ManifestFile[] = [];

  for (const rel of filteredFiles) {
    const srcPath = path.join(variantDir, rel);
    const destPath = path.join(dest, rel);
    const entry: ManifestFile = { path: rel, mode: 'created' };

    if (existsSync(destPath)) {
      const backupPath = path.join(backupRoot, rel);
      mkdirSync(path.dirname(backupPath), { recursive: true });
      copyFileSync(destPath, backupPath);
      entry.mode = 'overwrote';
      entry.backupPath = path.relative(dest, backupPath);
    }

    mkdirSync(path.dirname(destPath), { recursive: true });
    copyFileSync(srcPath, destPath);
    manifestFiles.push(entry);
  }

  const manifest: Manifest = { variantName, files: manifestFiles };
  writeFileSync(manifestPath(appName), JSON.stringify(manifest, null, 2) + '\n');

  const variantConfig = readVariantConfig(variantDir);
  if (variantConfig.scripts?.prepare) {
    runPrepareScript(variantDir, dest, variantConfig.scripts.prepare);
  }

  runStorybookGenerate(appName);
}

export function resetFixture(appName: string, opts?: { skipGenerate?: boolean }): void {
  const mPath = manifestPath(appName);
  if (!existsSync(mPath)) return;

  const manifest = JSON.parse(readFileSync(mPath, 'utf8')) as Manifest;
  const dest = appDir(appName);
  const backupRoot = backupDir(appName);

  const dirsToCheck = new Set<string>();
  for (const entry of manifest.files) {
    const fileAbs = path.join(dest, entry.path);
    if (entry.mode === 'overwrote' && entry.backupPath) {
      const backupAbs = path.join(dest, entry.backupPath);
      if (existsSync(backupAbs)) {
        mkdirSync(path.dirname(fileAbs), { recursive: true });
        copyFileSync(backupAbs, fileAbs);
      }
    } else {
      if (existsSync(fileAbs)) {
        unlinkSync(fileAbs);
      }
    }
    let dir = path.dirname(fileAbs);
    while (dir.startsWith(dest) && dir !== dest) {
      dirsToCheck.add(dir);
      dir = path.dirname(dir);
    }
  }

  const sortedDirs = Array.from(dirsToCheck).sort((a, b) => b.length - a.length);
  for (const dir of sortedDirs) {
    if (!existsSync(dir)) continue;
    try {
      const remaining = readdirSync(dir);
      if (remaining.length === 0) {
        rmdirSync(dir);
      }
    } catch {
      // ignore - directory may have been removed or is not actually empty
    }
  }

  if (existsSync(backupRoot)) {
    rmSync(backupRoot, { recursive: true, force: true });
  }

  const variantDir = path.join(VARIANTS_DIR, manifest.variantName);
  const variantConfig = readVariantConfig(variantDir);
  if (variantConfig.scripts?.cleanup) {
    runPrepareScript(variantDir, dest, variantConfig.scripts.cleanup);
  }

  unlinkSync(mPath);

  if (!opts?.skipGenerate) {
    runStorybookGenerate(appName);
  }
}
