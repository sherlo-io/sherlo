#!/usr/bin/env node
/**
 * THE PACKED CLI COMPUTES A BASE FINGERPRINT (SHERLO-1742).
 *
 *     yarn build && node scripts/check-packed-fingerprint.js     from packages/cli
 *
 * Proves the base-fingerprint path works from the REAL PUBLISH ARTIFACT - not the repo build
 * tree. This is the check that would have caught the shipped bug: `ncc` inlined
 * @expo/fingerprint into dist/index.js, but that library SPAWNS a helper file it ships -
 * ExpoConfigLoader.js - resolved relative to its own __dirname. Once inlined, __dirname was the
 * CLI's dist/, the helper was never emitted there, and the spawned subprocess died
 * MODULE_NOT_FOUND. Every test ran from the repo tree (where node_modules/@expo/fingerprint
 * exists), so none of them saw it.
 *
 * So this does exactly what a user's machine does, once, as a step of the pull request check
 * (the step before it compiles the CLI):
 *   1. `npm pack` the compiled CLI (the real tarball `npm publish` would upload).
 *   2. `npm install` that tarball into two fresh throwaway projects.
 *   3. Run the base-fingerprint path FROM THE INSTALLED node_modules/sherlo in each.
 *
 * and holds the two things the shipped artifact must guarantee:
 *   - AC1: on a staged-capable (managed Expo) fixture the fingerprint computes a non-null hash
 *     with NO ExpoConfigLoader spawn failure.
 *   - AC3: when @expo/fingerprint is unavailable, the CLI still LOADS and the base-fingerprint
 *     path degrades to hash:null - it never crashes a push.
 *
 * It was a unit test once; the pack and the two installs took most of a minute of the CLI suite,
 * and a unit suite is for what runs in seconds.
 */
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI_ROOT = path.resolve(__dirname, '..');

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'));
  if (manifest.name !== 'sherlo') {
    fail(`expected to pack the package named sherlo, found ${manifest.name}`);
  }
  if (!fs.existsSync(path.join(CLI_ROOT, 'dist', 'index.js'))) {
    fail('dist/index.js is missing - compile the CLI first (`yarn build` in packages/cli)');
  }

  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-pack-check-'));
  try {
    const tarball = path.join(
      scratchRoot,
      execFileSync('npm', ['pack', '--silent', '--pack-destination', scratchRoot], {
        cwd: CLI_ROOT,
        encoding: 'utf8',
      }).trim()
    );

    const stagedProject = installManagedExpoFixture(scratchRoot, tarball, 'staged');
    const failSoftProject = installManagedExpoFixture(scratchRoot, tarball, 'fail-soft');
    // Remove @expo/fingerprint (the package that ships the spawned ExpoConfigLoader.js helper) to
    // prove the CLI degrades, never crashes.
    fs.rmSync(path.join(failSoftProject, 'node_modules', '@expo', 'fingerprint'), {
      recursive: true,
      force: true,
    });

    const failures = [
      ...checkComputesAHash(runInstalledFingerprint(stagedProject)),
      ...checkDegradesToNull(runInstalledFingerprint(failSoftProject)),
    ];
    if (failures.length > 0) fail(failures.join('\n'));

    console.log(
      'the packed CLI computes a non-null hash with no ExpoConfigLoader spawn failure (AC1), ' +
        'and degrades to hash:null when @expo/fingerprint is unavailable (AC3)'
    );
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
}

/** AC1: the installed CLI computes a non-null hash with no ExpoConfigLoader spawn failure. */
function checkComputesAHash({ output, result }) {
  const failures = [];
  const says = (problem) => failures.push(`AC1 (computes a non-null hash): ${problem}`);

  // The CLI loaded and the fingerprint path ran to completion.
  if (!output.includes('SHERLO_FINGERPRINT_RESULT')) says('the fingerprint path never returned');
  if (output.includes('SHERLO_CLI_LOAD_CRASH')) says('the installed CLI did not load');
  if (output.includes('SHERLO_FINGERPRINT_THREW')) says('the fingerprint path threw');

  // The exact regression signature: @expo/fingerprint prints this warning when it fails to spawn
  // its ExpoConfigLoader.js helper. It must be absent, and the helper must never be looked for
  // inside the sherlo package.
  if (output.includes('Cannot get Expo config from an Expo project')) {
    says('@expo/fingerprint could not spawn its ExpoConfigLoader.js helper');
  }
  if (/sherlo[/\\]dist[/\\]ExpoConfigLoader\.js/.test(output)) {
    says('the helper was looked for inside the sherlo package');
  }

  // A staged-capable fixture yields a real base fingerprint.
  if (!/^[a-f0-9]{64}$/.test(String(result.hash))) says(`the hash was ${result.hash}`);

  return failures.map((failure) => `${failure}\n--- what the probe printed ---\n${output}`);
}

/** AC3: without @expo/fingerprint the installed CLI still loads and the hash degrades to null. */
function checkDegradesToNull({ output, result }) {
  const failures = [];
  const says = (problem) => failures.push(`AC3 (degrades to hash:null): ${problem}`);

  // The CLI still loads (fingerprint is loaded lazily, not at startup) and the base-fingerprint
  // path returns rather than throwing.
  if (output.includes('SHERLO_CLI_LOAD_CRASH')) says('the installed CLI did not load');
  if (output.includes('SHERLO_FINGERPRINT_THREW')) says('the fingerprint path threw');
  if (!output.includes('SHERLO_FINGERPRINT_RESULT')) says('the fingerprint path never returned');

  // Fail-soft: unavailable fingerprint -> null hash (staged flow unavailable).
  if (result.hash !== null) says(`the hash was ${result.hash}, not null`);

  return failures.map((failure) => `${failure}\n--- what the probe printed ---\n${output}`);
}

/** Run a command, failing the check with its captured output if it fails. */
function run(command, args, cwd) {
  const finished = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (finished.status !== 0) {
    fail(
      `\`${command} ${args.join(' ')}\` failed (exit ${finished.status}):\n` +
        `${finished.stdout ?? ''}\n${finished.stderr ?? ''}`
    );
  }
}

/**
 * Create a fresh throwaway project, install the packed CLI tarball into it, and shape it like a
 * minimal managed Expo app - just enough for @expo/fingerprint to resolve `expo/config`, spawn
 * its ExpoConfigLoader.js helper, and let that helper run to completion (load env, read the Expo
 * config). No real Expo install is needed - only the entry points the helper touches.
 */
function installManagedExpoFixture(scratchRoot, tarball, name) {
  const projectDir = path.join(scratchRoot, name);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify({ name: `fixture-${name}`, version: '1.0.0', private: true })
  );

  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', tarball], projectDir);

  writeFixtureFile(projectDir, 'app.json', JSON.stringify({ expo: { name, slug: name } }));

  // Minimal `expo` package: resolvable `expo/config` with a getConfig() the spawned helper calls.
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

  // Stub the autolinking CLI the managed path shells out to (`npx expo-modules-autolinking
  // resolve --json`), so the check never reaches the network for it. An empty list is enough.
  const autolinkBinRelPath = 'node_modules/.bin/expo-modules-autolinking';
  writeFixtureFile(projectDir, autolinkBinRelPath, "#!/usr/bin/env node\nconsole.log('[]');\n");
  fs.chmodSync(path.join(projectDir, autolinkBinRelPath), 0o755);

  return projectDir;
}

function writeFixtureFile(projectDir, relativePath, content) {
  const fullPath = path.join(projectDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

/**
 * Run the base-fingerprint path FROM THE INSTALLED CLI (node_modules/sherlo), with the project
 * directory as cwd, capturing combined stdout+stderr so any @expo/fingerprint spawn-failure
 * warning is seen.
 */
function runInstalledFingerprint(projectDir) {
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

  const finished = spawnSync(process.execPath, [probePath], { cwd: projectDir, encoding: 'utf8' });
  const output = `${finished.stdout ?? ''}${finished.stderr ?? ''}`;

  const match = output.match(/SHERLO_FINGERPRINT_RESULT (\{.*\})/);
  const result = match ? JSON.parse(match[1]) : { hash: null };

  return { output, result };
}

/** Stop the check with a reason; thrown, so the scratch folder is still removed on the way out. */
function fail(message) {
  throw new Error(message);
}

try {
  main();
} catch (error) {
  console.error(`The packed CLI's base fingerprint check failed:\n${error.message}`);
  process.exitCode = 1;
}
