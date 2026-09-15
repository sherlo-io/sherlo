/**
 * PACKAGING REGRESSION TEST (SHERLO-1742)
 *
 * Proves the base-fingerprint path works from the REAL PUBLISH ARTIFACT - not
 * the repo build tree. This is the one test that would have caught the shipped
 * bug: `ncc` inlined @expo/fingerprint into dist/index.js, but that library
 * SPAWNS a helper file it ships - ExpoConfigLoader.js - resolved relative to
 * its own __dirname. Once inlined, __dirname was the CLI's dist/, the helper was
 * never emitted there, and the spawned subprocess died MODULE_NOT_FOUND. Every
 * existing test ran from the repo tree (where node_modules/@expo/fingerprint
 * exists), so none of them saw it.
 *
 * So this test does exactly what a user's machine does:
 *   1. `yarn build` the CLI (produces dist/).
 *   2. `npm pack` it (the real tarball `npm publish` would upload).
 *   3. `npm install` that tarball into a fresh throwaway project.
 *   4. Run the base-fingerprint path FROM THE INSTALLED node_modules/sherlo.
 *
 * and asserts two things the shipped artifact must guarantee:
 *   - AC1: on a staged-capable (managed Expo) fixture the fingerprint computes a
 *     non-null hash with NO ExpoConfigLoader spawn failure.
 *   - AC3: when @expo/fingerprint is unavailable, the CLI still LOADS and the
 *     base-fingerprint path degrades to hash:null - it never crashes a push.
 *
 * It is heavy (build + pack + install) by necessity: only the installed artifact
 * can prove the spawned asset is reachable. It runs inside `yarn test` (vitest)
 * because that is the publish-gating unit workflow (pr_checks.yml).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// packages/cli root: this file is at src/helpers/fingerprint/__tests__/.
const CLI_ROOT = path.resolve(__dirname, '../../../..');

// Generous timeouts: the build + two installs are the slow part. Well under
// CI limits, but far above vitest's 5s default.
const SETUP_TIMEOUT_MS = 300_000;
const PROBE_TIMEOUT_MS = 60_000;

let tmpRoot: string;
let stagedProject: string;
let failSoftProject: string;

beforeAll(() => {
  // Sanity-check we resolved the right package before we build/pack it.
  const pkg = JSON.parse(fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'));
  expect(pkg.name).toBe('sherlo');

  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-pack-test-'));

  // 1. Build the CLI exactly as publish would (ncc bundle -> dist/).
  run('npm', ['run', 'build'], CLI_ROOT);

  // 2. Pack the real publish artifact.
  const tarball = path.join(
    tmpRoot,
    execFileSync('npm', ['pack', '--silent', '--pack-destination', tmpRoot], {
      cwd: CLI_ROOT,
      encoding: 'utf8',
    }).trim()
  );

  // 3. Install into two fresh projects.
  stagedProject = installManagedExpoFixture(tarball, 'staged');

  failSoftProject = installManagedExpoFixture(tarball, 'fail-soft');
  // Deliberately remove @expo/fingerprint (the package that ships the spawned
  // ExpoConfigLoader.js helper) to prove the CLI degrades, never crashes.
  fs.rmSync(path.join(failSoftProject, 'node_modules', '@expo', 'fingerprint'), {
    recursive: true,
    force: true,
  });
}, SETUP_TIMEOUT_MS);

afterAll(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('packaged CLI base fingerprint (installed artifact)', () => {
  it(
    'computes a non-null hash with no ExpoConfigLoader spawn failure (AC1)',
    () => {
      const { output, result } = runInstalledFingerprint(stagedProject);

      // The CLI loaded and the fingerprint path ran to completion.
      expect(output).toContain('SHERLO_FINGERPRINT_RESULT');
      expect(output).not.toContain('SHERLO_CLI_LOAD_CRASH');
      expect(output).not.toContain('SHERLO_FINGERPRINT_THREW');

      // The exact regression signature: @expo/fingerprint prints this warning
      // when it fails to spawn its ExpoConfigLoader.js helper. It must be absent,
      // and the helper must never be looked for inside the sherlo package.
      expect(output).not.toContain('Cannot get Expo config from an Expo project');
      expect(output).not.toMatch(/sherlo[/\\]dist[/\\]ExpoConfigLoader\.js/);

      // A staged-capable fixture yields a real base fingerprint.
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    },
    PROBE_TIMEOUT_MS
  );

  it(
    'degrades to hash:null and never crashes when @expo/fingerprint is unavailable (AC3)',
    () => {
      const { output, result } = runInstalledFingerprint(failSoftProject);

      // The CLI still loads (fingerprint is loaded lazily, not at startup) and
      // the base-fingerprint path returns rather than throwing.
      expect(output).not.toContain('SHERLO_CLI_LOAD_CRASH');
      expect(output).not.toContain('SHERLO_FINGERPRINT_THREW');
      expect(output).toContain('SHERLO_FINGERPRINT_RESULT');

      // Fail-soft: unavailable fingerprint -> null hash (staged flow unavailable).
      expect(result.hash).toBeNull();
    },
    PROBE_TIMEOUT_MS
  );
});

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

/** Run a command, throwing with captured output if it fails. */
function run(command: string, args: string[], cwd: string): void {
  const res = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(
      `\`${command} ${args.join(' ')}\` failed (exit ${res.status}):\n${res.stdout ?? ''}\n${
        res.stderr ?? ''
      }`
    );
  }
}

/**
 * Create a fresh throwaway project, install the packed CLI tarball into it, and
 * shape it like a minimal managed Expo app - just enough for @expo/fingerprint
 * to resolve `expo/config`, spawn its ExpoConfigLoader.js helper, and let that
 * helper run to completion (load env, read the Expo config). No real Expo
 * install is needed - only the entry points the helper touches.
 */
function installManagedExpoFixture(tarball: string, name: string): string {
  const projectDir = path.join(tmpRoot, name);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify({ name: `fixture-${name}`, version: '1.0.0', private: true })
  );

  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', tarball], projectDir);

  writeFixtureFile(projectDir, 'app.json', JSON.stringify({ expo: { name, slug: name } }));

  // Minimal `expo` package: resolvable `expo/config` with a getConfig() the
  // spawned helper calls.
  writeFixtureFile(
    projectDir,
    'node_modules/expo/package.json',
    JSON.stringify({ name: 'expo', version: '52.0.0', main: 'index.js' })
  );
  writeFixtureFile(
    projectDir,
    'node_modules/expo/config.js',
    `exports.getConfig = () => ({ exp: { name: ${JSON.stringify(name)}, slug: ${JSON.stringify(
      name
    )} } });\n`
  );

  // Minimal `@expo/env`: the helper loads it before reading the config.
  writeFixtureFile(
    projectDir,
    'node_modules/@expo/env/package.json',
    JSON.stringify({ name: '@expo/env', version: '0.0.0', main: 'index.js' })
  );
  writeFixtureFile(projectDir, 'node_modules/@expo/env/index.js', 'exports.load = () => {};\n');

  // Stub the autolinking CLI the managed path shells out to (`npx
  // expo-modules-autolinking resolve --json`), so the test never reaches the
  // network for it. Returning an empty module list is enough.
  const autolinkBinRelPath = 'node_modules/.bin/expo-modules-autolinking';
  writeFixtureFile(projectDir, autolinkBinRelPath, "#!/usr/bin/env node\nconsole.log('[]');\n");
  fs.chmodSync(path.join(projectDir, autolinkBinRelPath), 0o755);

  return projectDir;
}

function writeFixtureFile(projectDir: string, relativePath: string, content: string): void {
  const fullPath = path.join(projectDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

/**
 * Run the base-fingerprint path FROM THE INSTALLED CLI (node_modules/sherlo),
 * with the project directory as cwd, capturing combined stdout+stderr so we can
 * see any @expo/fingerprint spawn-failure warnings.
 */
function runInstalledFingerprint(projectDir: string): {
  output: string;
  result: { hash: string | null; debugMessage?: string };
} {
  const probePath = path.join(projectDir, 'probe.js');
  fs.writeFileSync(
    probePath,
    [
      'let computeBaseFingerprint;',
      'try {',
      "  ({ computeBaseFingerprint } = require('sherlo'));",
      '} catch (error) {',
      "  console.log('SHERLO_CLI_LOAD_CRASH ' + (error && error.message ? error.message : String(error)));",
      '  process.exit(0);',
      '}',
      'computeBaseFingerprint(process.cwd())',
      "  .then((result) => console.log('SHERLO_FINGERPRINT_RESULT ' + JSON.stringify(result)))",
      "  .catch((error) => console.log('SHERLO_FINGERPRINT_THREW ' + (error && error.stack ? error.stack : String(error))));",
    ].join('\n')
  );

  const res = spawnSync(process.execPath, [probePath], { cwd: projectDir, encoding: 'utf8' });
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;

  const match = output.match(/SHERLO_FINGERPRINT_RESULT (\{.*\})/);
  const result = match ? JSON.parse(match[1]) : { hash: null };

  return { output, result };
}
