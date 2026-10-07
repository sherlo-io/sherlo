// Spike runner (android-build-overrides): runs the steps the CLI will run, with timings.
// Usage:
//   node run.mjs install <expo|react-native>
//   node run.mjs gradle <expo|react-native> <gradle args...>
//   node run.mjs inspect <apk path>
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const spikeFolder = path.dirname(fileURLToPath(import.meta.url));
const testingFolder = path.resolve(spikeFolder, '../../testing');
const androidHome = process.env.ANDROID_HOME ?? '/opt/homebrew/share/android-commandlinetools';

function run(command, args, cwd) {
  console.log(`\n$ (cd ${cwd} && ${command} ${args.join(' ')})`);
  const startedAt = Date.now();
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n[spike] exit=${result.status} took=${seconds}s`);
  return result.status ?? 1;
}

const [step, ...rest] = process.argv.slice(2);

if (step === 'install') {
  process.exit(run('yarn', ['install'], path.join(testingFolder, rest[0])));
}

if (step === 'gradle') {
  const [app, ...gradleArgs] = rest;
  // SPIKE ONLY: Expo's export:embed ignores --config, so it gets the no-watchman Metro config by env.
  process.env.EXPO_OVERRIDE_METRO_CONFIG = path.join(spikeFolder, 'metro-no-watchman.config.js');
  process.env.METRO_APP_ROOT = path.join(testingFolder, app);
  process.exit(run('./gradlew', gradleArgs, path.join(testingFolder, app, 'android')));
}

if (step === 'inspect') {
  const apk = path.resolve(rest[0]);
  run(path.join(androidHome, 'cmdline-tools/latest/bin/apkanalyzer'), ['manifest', 'print', apk], spikeFolder);
  run(path.join(androidHome, 'cmdline-tools/latest/bin/apkanalyzer'), ['files', 'list', apk], spikeFolder);
  run(path.join(androidHome, 'build-tools/36.0.0/apksigner'), ['verify', '--print-certs', apk], spikeFolder);
  process.exit(0);
}

console.error(`unknown step: ${step}`);
process.exit(2);
