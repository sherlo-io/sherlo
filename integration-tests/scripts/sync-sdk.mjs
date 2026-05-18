#!/usr/bin/env node
// Syncs the local SDK build into the single base fixture (integrated-app-bare-rn).
// Only the base fixture's package.json lists @sherlo/react-native-storybook -
// @storybook/* deps are injected at test time via sb-version overlays.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTEGRATION_TESTS_DIR = path.resolve(__dirname, '..');
const SDK_DIR = path.resolve(INTEGRATION_TESTS_DIR, '../packages/react-native-storybook');
const APPS_DIR = path.join(INTEGRATION_TESTS_DIR, 'apps');

if (!existsSync(SDK_DIR)) {
  console.error(`SDK directory not found: ${SDK_DIR}`);
  process.exit(1);
}

// Discover fixture dirs that depend on @sherlo/react-native-storybook
// (expected: just integrated-app-bare-rn after the sb-version overlay refactor)
const fixtureDirs = readdirSync(APPS_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => path.join(APPS_DIR, e.name))
  .filter(dir => {
    const pkgPath = path.join(dir, 'package.json');
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return !!(pkg.dependencies?.['@sherlo/react-native-storybook']);
  });

if (fixtureDirs.length === 0) {
  console.error('No fixture directories found under apps/ with @sherlo/react-native-storybook');
  process.exit(1);
}

// Step 1: Rebuild SDK dist
console.log('Building SDK...');
execFileSync('yarn', ['build'], { cwd: SDK_DIR, stdio: 'inherit' });

// Step 2: Pack a stamped tarball into SDK_DIR so the name changes each run
const tarballName = `sherlo-rn-storybook-int-tests-${Date.now()}.tgz`;
const tarballPath = path.join(SDK_DIR, tarballName);

console.log(`Packing SDK → ${tarballPath}`);
execFileSync('yarn', ['pack', '-o', tarballPath], { cwd: SDK_DIR, stdio: 'inherit' });

// Step 3: Point each fixture's package.json at the new tarball (absolute path)
for (const fixtureDir of fixtureDirs) {
  const fixturePkgPath = path.join(fixtureDir, 'package.json');
  const fixturePkg = JSON.parse(readFileSync(fixturePkgPath, 'utf8'));
  fixturePkg.dependencies['@sherlo/react-native-storybook'] = `file:${tarballPath}`;
  writeFileSync(fixturePkgPath, JSON.stringify(fixturePkg, null, 2) + '\n', 'utf8');
  console.log(`${path.basename(fixtureDir)}: @sherlo/react-native-storybook → file:${tarballPath}`);
}

// Step 4: Remove old stamped tarballs from SDK_DIR (avoid clutter)
const oldTarballs = readdirSync(SDK_DIR).filter(
  f => f.startsWith('sherlo-rn-storybook-int-tests-') && f.endsWith('.tgz') && f !== tarballName,
);
for (const f of oldTarballs) {
  unlinkSync(path.join(SDK_DIR, f));
  console.log(`Removed old tarball: ${f}`);
}

// Step 5: Reinstall base fixture deps (YARN_ENABLE_IMMUTABLE_INSTALLS=false forces
// fresh extraction of the new tarball even if lockfile cache entry appears valid).
// Note: @storybook/* deps are NOT installed here - they are injected per-test via applySbVersion().
for (const fixtureDir of fixtureDirs) {
  console.log(`Running yarn install in ${path.basename(fixtureDir)}...`);
  execFileSync('yarn', ['install'], {
    cwd: fixtureDir,
    stdio: 'inherit',
    env: { ...process.env, YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' },
  });
}

console.log(`SDK synced to all fixtures: ${tarballPath}`);
