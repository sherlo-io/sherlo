/**
 * Computes `baseFingerprint` - a stable hash over the project's native inputs
 * that IGNORES version/build-number changes.  Sent alongside the existing
 * `nativeFingerprint` (which stays EXACTLY as today - never replaced).
 *
 * Three layers combined into a final SHA-256:
 *
 *   Layer 1 – @expo/fingerprint with version suppression
 *     Managed: SourceSkips.ExpoConfigVersions + ExpoConfigRuntimeVersionIfString
 *     Bare:    streaming fileHookTransform that strips version lines from
 *              *.plist (CFBundleVersion / MARKETING_VERSION) and build.gradle*
 *              (versionName / versionCode).
 *
 *   Layer 2 – Augmented sources @expo/fingerprint misses
 *     SHA of each present lockfile (yarn / npm / pnpm), Podfile.lock, Gemfile.lock,
 *     plus the SORTED autolinked native-module set (name + version).
 *
 *   Layer 3 – Workflow detection
 *     "bare" when android/app/build.gradle or ios/ exists; else "managed".
 *     Selects which Layer-1 suppression to apply.
 *
 * The result is deterministic across repeated runs and across machines /
 * fresh-vs-warm installs.  A pure version/buildNumber/versionCode bump MUST
 * NOT change the output.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  FileHookTransformFunction,
  FileHookTransformSource,
  Options as FingerprintOptions,
} from '@expo/fingerprint';
import runShellCommand from '../runShellCommand';

/**
 * `@expo/fingerprint` is an EXTERNAL runtime dependency: it is declared in
 * `dependencies` and EXCLUDED from the ncc bundle (see the
 * `--external @expo/fingerprint` build flag in package.json). It must stay
 * external because at runtime it SPAWNS a helper file it ships -
 * `ExpoConfigLoader.js` - resolved relative to its own `__dirname`. If it were
 * inlined into the CLI's `dist/`, that `__dirname` would point at `dist/`,
 * where the helper was never emitted, and the spawned subprocess would die with
 * MODULE_NOT_FOUND (SHERLO-1742). Kept external, the library runs from its own
 * installed package directory with its helper assets intact.
 *
 * Because it is external (and only the types above are compiled in), it is
 * loaded LAZILY here via a dynamic `import()` rather than a top-level `import`
 * value binding. A top-level binding compiles to an eager
 * `require('@expo/fingerprint')` that would run when the CLI module graph loads,
 * so a missing or broken install would crash the ENTIRE CLI at startup. Loading
 * it inside `computeBaseFingerprint`'s fail-soft try/catch instead means an
 * unavailable fingerprint library degrades only this one function to
 * `hash: null` (staged flow unavailable) and NEVER crashes a push.
 */
type ExpoFingerprintModule = typeof import('@expo/fingerprint');

function loadExpoFingerprint(): Promise<ExpoFingerprintModule> {
  return import('@expo/fingerprint');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type BaseFingerprintResult = {
  /** The computed base fingerprint hash, or null when unrecoverable. */
  hash: string | null;
  /** Human-readable description of what happened. */
  debugMessage?: string;
};

export type ComputeBaseFingerprintOptions = {
  /**
   * The CLI command that triggered this computation (e.g. 'test:standard',
   * 'staged:check'). Used ONLY to tag `SHERLO_FINGERPRINT_DEBUG` output so a
   * per-command breakdown can be diffed across commands. Has no effect on the
   * computed hash.
   */
  command?: string;
};

/**
 * Compute the base fingerprint for the project at `projectRoot`.
 *
 * Returns `{ hash: null }` with a `debugMessage` when the computation fails
 * (missing @expo/fingerprint, no native dirs, …).  Callers MUST treat a null
 * hash as "stageable flow unavailable" and print the debugMessage.
 *
 * DETERMINISM CONTRACT (SHERLO-1744, SHERLO-1746): over an identical tree, this
 * MUST return the SAME hash no matter which command called it. Three inputs used
 * to break that and are now pinned:
 *   1. `projectRoot` path form. `@expo/fingerprint` is path-form-sensitive -
 *      the '.'-form and the absolute form of the SAME tree hash differently
 *      (proved by harness run 29142544470). We `path.resolve()` to an absolute
 *      canonical form before handing it to any layer, so a caller passing '.'
 *      and a caller passing an absolute path agree.
 *   2. The Layer-2 autolinking subprocess environment (see
 *      {@link buildDeterministicEnv}).
 *   3. The Layer-1 `@expo/fingerprint` compute environment (SHERLO-1746). The
 *      library internally spawns `ExpoConfigLoader.js` to evaluate the app
 *      config, which inherits the CLI's per-command ambient env; an
 *      app.config.js that reads env would then hash differently per command. We
 *      swap in the same deterministic env around the library call (see
 *      {@link withDeterministicEnv}).
 *
 * Set `SHERLO_FINGERPRINT_DEBUG=1` to print the full per-layer breakdown
 * (tagged by command) - permanent, off-by-default observability.
 */
/** The env mode applied to the Layer-1 compute - surfaced by the debug instrument. */
const LAYER1_ENV_MODE = 'sanitized';

/**
 * Run `fn` with `process.env` temporarily replaced by the deterministic env
 * ({@link buildDeterministicEnv}), restoring the exact original env afterward.
 *
 * WHY ENV-SWAP (and not a child process): Layer 1 is
 * `createFingerprintAsync`, and its BARE path passes `fileHookTransform:
 * createVersionStrippingTransform()` - a live JS closure that cannot be
 * serialized across a process boundary. Running the library in a child process
 * would force us to reimplement/duplicate that transform. Instead we keep
 * `createFingerprintAsync` IN-PROCESS (the closure works) and control the
 * ambient env it exposes to the `ExpoConfigLoader.js` subprocess it spawns
 * internally: an app.config.js that reads env (API urls, feature flags, build
 * profiles - the standard Expo pattern) then evaluates identically per command.
 *
 * The swap is done by IN-PLACE mutation of `process.env` (delete-all +
 * Object.assign) rather than reassigning `process.env` to a new object: Node
 * snapshots the live `process.env` object at `child_process` spawn time, so an
 * in-place mutation is guaranteed to be reflected in the child ExpoConfigLoader
 * spawn, whereas a reassignment can be missed.
 *
 * ASYNC / EXCEPTION / CONCURRENCY SAFETY:
 *   - Exception-safe: the finally-block restores the original env even when
 *     `fn` throws; the throw then propagates to the outer try/catch in
 *     `computeBaseFingerprint`, which returns `{ hash: null }` (fail-soft
 *     preserved). No allowlist value leaks past this call on any path.
 *   - Concurrency-safe within the CLI process: `computeBaseFingerprint` is only
 *     ever `await`ed as a single standalone call in each of its 5 callers
 *     (registerBase, stagedCheck, testBundled, easBuildOnComplete's
 *     asyncUploadBuildAndRunTests, uploadOrReuseBuildsAndRunTests). None wraps
 *     it in `Promise.all`/`Promise.race` or runs other env-reading/subprocess
 *     work concurrently during the compute (in the two callers that also compute
 *     a native fingerprint, that work is fully awaited on a preceding line). The
 *     swap window is also kept as narrow as possible - only the single library
 *     call is wrapped - further shrinking any theoretical window.
 */
async function withDeterministicEnv<T>(fn: () => Promise<T>): Promise<T> {
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
}

export async function computeBaseFingerprint(
  projectRoot: string,
  options: ComputeBaseFingerprintOptions = {}
): Promise<BaseFingerprintResult> {
  const command = options.command ?? 'unknown';

  // Determinism fix #1: normalize the project root to an absolute canonical
  // path BEFORE any layer runs. `@expo/fingerprint` (Layer 1) is path-form
  // sensitive, so a caller passing '.' and one passing an absolute path would
  // otherwise produce different Layer-1 hashes over the same tree.
  const resolvedProjectRoot = path.resolve(projectRoot);

  // ------------------------------------------------------------------
  // Layer 3 - workflow detection (must happen first so Layers 1-2 can
  //           adapt to the project shape).
  // ------------------------------------------------------------------
  const workflow = detectWorkflow(resolvedProjectRoot);

  // ------------------------------------------------------------------
  // Layer 1 - @expo/fingerprint with version suppression.
  // ------------------------------------------------------------------
  let layer1Hash: string | null = null;

  try {
    // Lazy, fail-soft load: a missing/broken @expo/fingerprint install rejects
    // here and is caught below, degrading to hash:null instead of crashing.
    const { createFingerprintAsync, SourceSkips } = await loadExpoFingerprint();

    const fingerprintOptions: FingerprintOptions =
      workflow === 'managed'
        ? {
            sourceSkips:
              SourceSkips.ExpoConfigVersions | SourceSkips.ExpoConfigRuntimeVersionIfString,
          }
        : {
            fileHookTransform: createVersionStrippingTransform(),
          };

    // Layer 1 (SHERLO-1746): swap in the deterministic env around the library
    // call so the `ExpoConfigLoader.js` subprocess @expo/fingerprint spawns
    // internally cannot inherit the per-command ambient env. Layer 2 handles its
    // own env via `runShellCommand` (`envMode: 'replace'`) and is NOT wrapped.
    const fingerprint = await withDeterministicEnv(() =>
      createFingerprintAsync(resolvedProjectRoot, fingerprintOptions)
    );
    layer1Hash = fingerprint.hash;
  } catch (err) {
    // @expo/fingerprint may not be installed, or the project may have no
    // native dirs.  Fail-soft - return null and let the caller proceed.
    return {
      hash: null,
      debugMessage: `@expo/fingerprint unavailable or failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  if (!layer1Hash) {
    return { hash: null, debugMessage: '@expo/fingerprint returned an empty hash' };
  }

  // ------------------------------------------------------------------
  // Layer 2 - augmented sources.
  // ------------------------------------------------------------------
  const lockfileHashes = await hashLockfiles(resolvedProjectRoot);
  const autolinkedModules = await getAutolinkedModules(resolvedProjectRoot, workflow);

  // ------------------------------------------------------------------
  // Final - combine all layers into a single stable hash.
  // ------------------------------------------------------------------
  const combined = crypto.createHash('sha256');

  combined.update('layer1:');
  combined.update(layer1Hash);

  combined.update('|lockfiles:');
  for (const lh of lockfileHashes) {
    combined.update(lh);
  }

  combined.update('|autolinked:');
  combined.update(autolinkedModules);

  combined.update('|workflow:');
  combined.update(workflow);

  const finalHash = combined.digest('hex');

  emitFingerprintDebug({
    command,
    rawProjectRoot: projectRoot,
    resolvedProjectRoot,
    workflow,
    layer1Hash,
    layer1EnvMode: LAYER1_ENV_MODE,
    lockfileHashes,
    autolinkedModules,
    finalHash,
  });

  return { hash: finalHash };
}

// ---------------------------------------------------------------------------
// Debug instrument (SHERLO-1744, AC1) - permanent, env-gated observability
// ---------------------------------------------------------------------------

/**
 * When `SHERLO_FINGERPRINT_DEBUG=1`, print the full per-layer breakdown of ONE
 * base-fingerprint computation, TAGGED BY COMMAND. This is permanent product
 * code - it stays after the SHERLO-1744 fix as the tool that names any future
 * cross-command divergence. Off by default: zero output unless the env var is
 * set.
 *
 * Every line is prefixed `[sherlo:fp-debug]` and carries the triggering command
 * so two commands' breakdowns can be captured and diffed line-for-line.
 */
function emitFingerprintDebug(fields: {
  command: string;
  rawProjectRoot: string;
  resolvedProjectRoot: string;
  workflow: Workflow;
  layer1Hash: string;
  layer1EnvMode: string;
  lockfileHashes: string[];
  autolinkedModules: string;
  finalHash: string;
}): void {
  if (process.env.SHERLO_FINGERPRINT_DEBUG !== '1') return;

  const { command } = fields;
  const tag = (line: string): string => `[sherlo:fp-debug][${command}] ${line}`;
  const lines: string[] = [];

  lines.push(tag(`command=${command}`));

  // Layer 0 - path form. @expo/fingerprint is PATH-FORM-SENSITIVE: the '.'-form
  // and the absolute form of one tree hash differently. We normalize to the
  // resolved form before hashing; both forms are surfaced here so a path-form
  // skew between commands is immediately visible.
  lines.push(
    tag(
      `projectRoot.raw=${JSON.stringify(fields.rawProjectRoot)} ` +
        `projectRoot.resolved=${JSON.stringify(fields.resolvedProjectRoot)} ` +
        '(FOOTGUN: @expo/fingerprint is path-form-sensitive; normalized to resolved before hashing)'
    )
  );

  // Layer 1 - @expo/fingerprint hash + the env mode its compute ran under.
  // `layer1.envMode=sanitized` means the deterministic env-swap (SHERLO-1746)
  // was in force around the library call, so its internal ExpoConfigLoader
  // subprocess could not observe the per-command ambient env. Any other value
  // here would name an env leak - a future regression is one grep away.
  lines.push(tag(`layer1.envMode=${fields.layer1EnvMode}`));
  lines.push(tag(`layer1.hash=${fields.layer1Hash}`));

  // Layer 2 - augmented sources: each lockfile SHA + the sorted autolinked set.
  if (fields.lockfileHashes.length === 0) {
    lines.push(tag('layer2.lockfiles=(none present)'));
  } else {
    for (const lockfileHash of fields.lockfileHashes) {
      lines.push(tag(`layer2.lockfile ${lockfileHash}`));
    }
  }

  const autolinkedEntries = fields.autolinkedModules ? fields.autolinkedModules.split('\n') : [];
  lines.push(tag(`layer2.autolinked.count=${autolinkedEntries.length}`));
  for (const entry of autolinkedEntries) {
    lines.push(tag(`layer2.autolinked ${entry}`));
  }
  // A sub-hash of the Layer-2 inputs, so a divergence shows up as a single
  // changed value even before scanning the per-entry lines above.
  const layer2Hash = crypto
    .createHash('sha256')
    .update(`lockfiles:${fields.lockfileHashes.join('')}|autolinked:${fields.autolinkedModules}`)
    .digest('hex');
  lines.push(tag(`layer2.hash=${layer2Hash}`));

  // Layer 3 - workflow detection.
  lines.push(tag(`layer3.workflow=${fields.workflow}`));

  // Final wire value - what actually gets sent to the gate.
  lines.push(tag(`final.wire=${fields.finalHash}`));

  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Layer 3 - workflow detection
// ---------------------------------------------------------------------------

type Workflow = 'managed' | 'bare';

function detectWorkflow(projectRoot: string): Workflow {
  const bareIndicators = [
    path.join(projectRoot, 'android', 'app', 'build.gradle'),
    path.join(projectRoot, 'android', 'app', 'build.gradle.kts'),
    path.join(projectRoot, 'ios'),
  ];

  for (const indicator of bareIndicators) {
    if (fs.existsSync(indicator)) return 'bare';
  }

  return 'managed';
}

// ---------------------------------------------------------------------------
// Layer 1 helpers - version-stripping fileHookTransform (bare projects)
// ---------------------------------------------------------------------------

/**
 * File paths (relative to project root) whose content is version-bearing.
 * The transform only intercepts these; everything else passes through unchanged.
 */
const VERSION_FILE_PATTERNS = [/\.plist$/i, /build\.gradle(\.kts)?$/i];

function isVersionFile(filePath: string): boolean {
  return VERSION_FILE_PATTERNS.some((re) => re.test(filePath));
}

/**
 * Creates a stateful {@link FileHookTransformFunction} that buffers chunks
 * per file path, returns "" for intermediate chunks (so they don't contribute
 * to the hash), and at end-of-file returns the version-stripped content.
 *
 * This is the ONLY correct approach for bare projects because @expo/fingerprint
 * hashes `ios/` and `android/` as SINGLE directory entries - there are no
 * per-file hashes to patch post-hoc.
 */
function createVersionStrippingTransform(): FileHookTransformFunction {
  const buffers = new Map<string, string[]>();

  return (
    source: FileHookTransformSource,
    chunk: Buffer | string | null,
    isEndOfFile: boolean,
    _encoding: BufferEncoding
  ): Buffer | string | null => {
    // Only transform file sources - pass contents sources through.
    if (source.type !== 'file') {
      return chunk;
    }

    const { filePath } = source;

    // Pass through non-version files unchanged.
    if (!isVersionFile(filePath)) {
      return chunk;
    }

    // Buffer intermediate chunks; return empty so they don't hash.
    if (!isEndOfFile && chunk !== null) {
      let buf = buffers.get(filePath);
      if (!buf) {
        buf = [];
        buffers.set(filePath, buf);
      }
      buf.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      return '';
    }

    // End of file - apply version stripping.
    const stored = buffers.get(filePath);
    buffers.delete(filePath);

    if (!stored || stored.length === 0) {
      // File was empty or had no buffered content - pass chunk through.
      return chunk;
    }

    const content = stored.join('');
    const transformed = stripVersionLines(filePath, content);
    return transformed;
  };
}

/**
 * Strip version-bearing lines from a single file's content.
 *
 * - *.plist:  CFBundleVersion, MARKETING_VERSION
 * - build.gradle / build.gradle.kts: versionName, versionCode
 *
 * Exported for direct unit testing of AC2 version-suppression behaviour.
 */
export function stripVersionLines(filePath: string, content: string): string {
  if (/\.plist$/i.test(filePath)) {
    const lines = content.split('\n');
    const result: string[] = [];
    let skipNext = false;

    for (const line of lines) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      const trimmed = line.trim();
      if (trimmed.includes('CFBundleVersion') || trimmed.includes('MARKETING_VERSION')) {
        // This line is a version key - skip it AND the following value line.
        skipNext = true;
        continue;
      }
      result.push(line);
    }

    return result.join('\n');
  }

  if (/build\.gradle(\.kts)?$/i.test(filePath)) {
    return content
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        // Match versionName "…" / versionCode … at the start of a logical line.
        return !/^\s*(versionName|versionCode)\s+/i.test(trimmed);
      })
      .join('\n');
  }

  return content;
}

// ---------------------------------------------------------------------------
// Layer 2 helpers - lockfiles
// ---------------------------------------------------------------------------

const LOCKFILES = [
  'yarn.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'ios/Podfile.lock',
  'Gemfile.lock',
];

/**
 * Returns a SHA-256 hex string for each lockfile present in the project,
 * sorted by filename for determinism.
 */
async function hashLockfiles(projectRoot: string): Promise<string[]> {
  const results: string[] = [];

  for (const lockfile of LOCKFILES.sort()) {
    const lockPath = path.join(projectRoot, lockfile);
    try {
      const content = await fs.promises.readFile(lockPath, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      results.push(`${lockfile}:${hash}`);
    } catch {
      // Lockfile absent - skip.
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Layer 2 helpers - autolinked native modules
// ---------------------------------------------------------------------------

/**
 * Determinism: any subprocess that participates in the fingerprint must see a
 * COMMAND-INDEPENDENT environment.
 *
 * Ambient `process.env` is NOT stable across commands: a package manager injects
 * `NODE_ENV`, `npm_lifecycle_event`, `npm_config_*`, `NODE_OPTIONS`, … that
 * differ depending on which yarn script (test:standard vs staged:check vs
 * test:bundled) launched the CLI. If any of those leak into a fingerprint-time
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
 *     around the `createFingerprintAsync` call (see {@link withDeterministicEnv})
 *     so an app.config.js that reads env hashes identically per command.
 *
 * It is a fixed allowlist of resolution-stable variables plus a pinned
 * `NODE_ENV='production'`, so tools that branch dev-vs-prod resolve the same way
 * every time regardless of the launching script.
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

function buildDeterministicEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of DETERMINISTIC_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  // Pin NODE_ENV so dev-vs-prod resolution branches behave identically
  // regardless of the launching script.
  env.NODE_ENV = 'production';
  return env;
}

/**
 * Returns a sorted, stable string representation of the autolinked native
 * module set: "name@version" pairs joined with newlines.
 *
 * Bare projects use `npx react-native config`; managed projects use
 * `npx expo-modules-autolinking resolve`.  Falls back to an empty string when
 * neither command succeeds (best-effort).
 *
 * The subprocess runs with a deterministic, command-independent environment -
 * see {@link buildDeterministicEnv}.
 */
async function getAutolinkedModules(projectRoot: string, workflow: Workflow): Promise<string> {
  try {
    if (workflow === 'bare') {
      return await getBareAutolinkedModules(projectRoot);
    }
    return await getManagedAutolinkedModules(projectRoot);
  } catch {
    return '';
  }
}

async function getBareAutolinkedModules(projectRoot: string): Promise<string> {
  try {
    const output = await runShellCommand({
      command: 'npx react-native config',
      projectRoot,
      env: buildDeterministicEnv(),
      envMode: 'replace',
    });
    const config = JSON.parse(output);
    const deps: Record<string, { name: string; version: string }> = config?.dependencies ?? {};

    const entries = Object.values(deps)
      .map((d) => `${d.name}@${d.version}`)
      .sort();

    return entries.join('\n');
  } catch {
    return '';
  }
}

async function getManagedAutolinkedModules(projectRoot: string): Promise<string> {
  try {
    // expo-modules-autolinking resolve outputs a JSON array of module descriptors.
    const output = await runShellCommand({
      command: 'npx expo-modules-autolinking resolve --json',
      projectRoot,
      env: buildDeterministicEnv(),
      envMode: 'replace',
    });
    const modules: { podName?: string; npmPackageName?: string; version?: string }[] =
      JSON.parse(output);

    const entries = modules
      .map((m) => {
        const name = m.npmPackageName ?? m.podName ?? 'unknown';
        const version = m.version ?? '0.0.0';
        return `${name}@${version}`;
      })
      .sort();

    return entries.join('\n');
  } catch {
    // Fall back to expo config approach (older Expo SDKs).
    try {
      const output = await runShellCommand({
        command: 'npx expo config --json',
        projectRoot,
        env: buildDeterministicEnv(),
        envMode: 'replace',
      });
      const config = JSON.parse(output);
      const modules: string[] = config?.expo?.plugins ?? [];
      return modules.sort().join('\n');
    } catch {
      return '';
    }
  }
}
