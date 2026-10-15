/**
 * The one environment every part of the fingerprint runs under, and the lock that keeps the
 * machine's own environment from being read while the fingerprint has it swapped out.
 */
import { SHERLO_BUILD_FOR_PUSH } from '../../commands/test/constants';

/**
 * Determinism: any subprocess that participates in the fingerprint must see a
 * COMMAND-INDEPENDENT environment.
 *
 * Ambient `process.env` is NOT stable across commands: a package manager injects
 * `NODE_ENV`, `npm_lifecycle_event`, `npm_config_*`, `NODE_OPTIONS`, … that
 * differ depending on which yarn script launched the CLI. If any of those leak into a fingerprint-time
 * subprocess and that subprocess branches on them, the SAME tree hashes
 * differently per command and the staged gate lookup misses.
 *
 * This env is the single deterministic environment used by BOTH layers:
 *   - Layer 2 (SHERLO-1744): the autolinking resolve subprocess
 *     (`npx react-native config` / `npx expo-modules-autolinking resolve`) runs
 *     with `envMode: 'replace'` and exactly this env.
 *   - Layer 1 (SHERLO-1746): `@expo/fingerprint` internally spawns its own
 *     `ExpoConfigLoader.js` to evaluate the app config; that child inherits the
 *     CLI's ambient env at spawn time. We swap `process.env` to this same env
 *     around the `createFingerprintAsync` calls (see {@link withDeterministicEnv})
 *     so an app.config.js that reads env hashes identically per command.
 *
 * It is a fixed allowlist of resolution-stable variables plus a pinned
 * `NODE_ENV='production'`, so tools that branch dev-vs-prod resolve the same way
 * every time regardless of the launching script. `SHERLO_BUILD` is pinned to what
 * Sherlo's own builds set it to, whatever the shell says: the SDK's config plugin
 * reads it, and the autolinking answer Expo's fingerprint hashes follows it.
 */
const DETERMINISTIC_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TEMP',
  'TMP',
  // Windows resolution essentials.
  'SystemRoot',
  'PATHEXT',
  'APPDATA',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ComSpec',
];

/** Exported for the test that pins what it sets, whatever the shell says. */
export function buildDeterministicEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of DETERMINISTIC_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  // Pin NODE_ENV so dev-vs-prod resolution branches behave identically
  // regardless of the launching script.
  env.NODE_ENV = 'production';
  // Pin SHERLO_BUILD to what Sherlo's builds set, so the fingerprint names the
  // app build Sherlo makes, whatever the developer's shell exports.
  env.SHERLO_BUILD = SHERLO_BUILD_FOR_PUSH;
  return env;
}

/**
 * The end of the last piece of work that holds the environment: each new holder waits for it, so
 * no two holders ever overlap.
 */
let previousHolderDone: Promise<unknown> = Promise.resolve();

/** Run `work` once every earlier holder of the environment is done, and alone. */
function holdingTheEnv<T>(work: () => Promise<T>): Promise<T> {
  const thisHolder = previousHolderDone.then(work);
  // A holder that fails must not keep the next one waiting forever.
  previousHolderDone = thisHolder.catch(() => undefined);
  return thisHolder;
}

/**
 * Run `fn` with `process.env` temporarily replaced by the deterministic env
 * ({@link buildDeterministicEnv}), restoring the exact original env afterward.
 *
 * WHY ENV-SWAP (and not a child process, nor an `env` handed to the children):
 * Layer 1 is `createFingerprintAsync`, and its BARE path passes `fileHookTransform:
 * createVersionStrippingTransform()` - a live JS closure that cannot be
 * serialized across a process boundary, so the library stays IN-PROCESS. The
 * library spawns `ExpoConfigLoader.js` and its autolinking with no `env` option
 * and offers none, so the only environment those children can get is the
 * process's own: an app.config.js that reads env (API urls, feature flags, build
 * profiles - the standard Expo pattern) then evaluates identically per command.
 *
 * The swap is done by IN-PLACE mutation of `process.env` (delete-all +
 * Object.assign) rather than reassigning `process.env` to a new object: Node
 * snapshots the live `process.env` object at `child_process` spawn time, so an
 * in-place mutation is guaranteed to be reflected in the child ExpoConfigLoader
 * spawn, whereas a reassignment can be missed.
 *
 * NOTHING ELSE SEES THE SWAPPED ENV: every swap holds the environment's lock
 * ({@link holdingTheEnv}), so two swaps never overlap - an overlapping second one
 * would save the first one's deterministic env as "the original" and leave it in
 * place for the rest of the command. Every check of the machine that reads the
 * environment takes the same lock through {@link withTheMachineEnv}, so it waits
 * for a swap to end. Exception-safe: the finally-block restores the original env
 * even when `fn` throws.
 */
export function withDeterministicEnv<T>(fn: () => Promise<T>): Promise<T> {
  return holdingTheEnv(async () => {
    const saved = { ...process.env };
    const deterministic = buildDeterministicEnv();
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, deterministic);
    try {
      return await fn();
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  });
}

/**
 * Run `check` - a look at the machine that reads the environment, such as where the Android SDK is
 * - once no fingerprint has the environment swapped, so it reads the machine's own.
 */
export function withTheMachineEnv<T>(check: () => Promise<T>): Promise<T> {
  return holdingTheEnv(check);
}
