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
  Fingerprint,
  FingerprintSource,
  Options as FingerprintOptions,
} from '@expo/fingerprint';
import reporting from '../reporting';
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

/**
 * ONE `@expo/fingerprint` source, reduced to what is safe to keep.
 *
 * SECURITY - READ BEFORE ADDING A FIELD. `@expo/fingerprint` emits sources of
 * type `contents` whose VALUE IS the hashed input: the resolved autolinking
 * output and the resolved `expo config --json`. A resolved Expo config routinely
 * carries customer secrets in `extra` (API keys, tokens, EAS project secrets).
 * Retaining that value would put secrets into a structure meant to be written to
 * a file and diffed, so the value is NEVER kept - only its `id` and its `hash`,
 * which is all a diff needs to say "this source changed". The same rule holds for
 * `file`/`dir` sources: the PATH and the hash, never the bytes.
 */
export type FingerprintSourceDigest = {
  type: 'file' | 'dir' | 'contents';
  /** The path for a `file`/`dir` source, the source id for a `contents` source. */
  id: string;
  /** `@expo/fingerprint`'s hash of this source; null when it excluded the source. */
  hash: string | null;
};

/** One lockfile that contributed to the fingerprint, and the digest of its bytes. */
export type LockfileDigest = {
  /** Project-relative lockfile path, e.g. `yarn.lock` or `ios/Podfile.lock`. */
  file: string;
  /** sha256 of the lockfile's bytes. */
  digest: string;
};

/**
 * The INPUTS the base fingerprint hash was computed over - the pre-image.
 *
 * Everything here is already computed on the way to the hash and was previously
 * discarded. Keeping it lets a later step explain a fingerprint change instead of
 * only reporting that one happened. It is plain JSON so it can be written to a
 * file as-is. It carries digests and identifiers only, never source text.
 */
export type BaseFingerprintPreimage = {
  workflow: Workflow;
  /** The Layer-1 `@expo/fingerprint` sources, digest-only (see the type doc). */
  nativeSources: FingerprintSourceDigest[];
  /** Layer-2 lockfiles, sorted by filename, one digest each. */
  lockfiles: LockfileDigest[];
  /** Layer-2 autolinked native modules as sorted `name@version` entries. */
  autolinkedModules: string[];
};

export type BaseFingerprintResult = {
  /** The computed base fingerprint hash, or null when unrecoverable. */
  hash: string | null;
  /**
   * The inputs `hash` was computed over. Present exactly when `hash` is - an
   * unrecoverable fingerprint has no pre-image to report.
   */
  preimage?: BaseFingerprintPreimage;
  /**
   * The sanitized Layer-1 `@expo/fingerprint` hash that this base fingerprint
   * was built on (version-suppressed, computed under the deterministic env).
   *
   * This is the SINGLE `createFingerprintAsync` result for the whole process:
   * the diffScope `nativeFingerprint` wire value is sourced from here rather
   * than from a second, raw `createFingerprintAsync` call (SHERLO-1756). It is
   * `undefined` whenever the base fingerprint is unrecoverable (`hash: null`),
   * matching the previous fail-soft behaviour of `computeNativeFingerprint`.
   */
  nativeFingerprint?: string;
  /** Human-readable description of what happened. */
  debugMessage?: string;
};

export type ComputeBaseFingerprintOptions = {
  /**
   * The CLI command that triggered this computation (e.g. 'test'). Recorded on the reporting breadcrumb so a reported failure names
   * its caller. Has no effect on the computed hash.
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
 * `sherlo fingerprint --verbose` prints the full per-layer breakdown - every
 * source, lockfile and autolinked module behind the hash.
 */

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
  reporting.addBreadcrumb({
    category: 'fingerprint',
    message: 'Computing base fingerprint',
    data: { command: options.command ?? 'unknown', projectRoot },
    level: 'info',
  });

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
  let layer1Sources: FingerprintSourceDigest[] = [];

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
    const fingerprint: Fingerprint = await withDeterministicEnv(() =>
      createFingerprintAsync(resolvedProjectRoot, fingerprintOptions)
    );
    layer1Hash = fingerprint.hash;

    // Retain the sources @expo/fingerprint already computed, reduced to
    // identifier + hash. A `contents` source's VALUE is deliberately dropped: it
    // is the resolved autolinking output or the resolved `expo config --json`,
    // and a resolved Expo config routinely holds customer secrets in `extra`.
    // See {@link FingerprintSourceDigest} - do not widen this mapping.
    layer1Sources = (fingerprint.sources ?? []).map((source: FingerprintSource) => ({
      type: source.type,
      id: source.type === 'contents' ? source.id : source.filePath,
      hash: source.hash,
    }));
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
  const lockfiles = await hashLockfiles(resolvedProjectRoot);
  const autolinkedModules = await getAutolinkedModules(resolvedProjectRoot, workflow);

  // ------------------------------------------------------------------
  // Final - combine all layers into a single stable hash.
  // ------------------------------------------------------------------
  const combined = crypto.createHash('sha256');

  combined.update('layer1:');
  combined.update(layer1Hash);

  combined.update('|lockfiles:');
  for (const lockfile of lockfiles) {
    combined.update(lockfileHashLine(lockfile));
  }

  combined.update('|autolinked:');
  combined.update(autolinkedModules);

  combined.update('|workflow:');
  combined.update(workflow);

  const finalHash = combined.digest('hex');

  // `nativeFingerprint` is the sanitized Layer-1 hash, exposed so the diffScope
  // wire value can be sourced from this SINGLE compute instead of a second, raw
  // `createFingerprintAsync` call (SHERLO-1756). `layer1Hash` is guaranteed
  // non-null here (the null case returned early above).
  return {
    hash: finalHash,
    nativeFingerprint: layer1Hash,
    preimage: {
      workflow,
      nativeSources: layer1Sources,
      lockfiles,
      // `getAutolinkedModules` returns the entries newline-joined because that is
      // the exact string the hash consumes; the pre-image wants them as a list.
      autolinkedModules: autolinkedModules ? autolinkedModules.split('\n') : [],
    },
  };
}

// ---------------------------------------------------------------------------
// Layer 3 - workflow detection
// ---------------------------------------------------------------------------

export type Workflow = 'managed' | 'bare';

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
 * Returns the filename and SHA-256 of each lockfile present in the project,
 * sorted by filename for determinism.
 *
 * The pair is kept structured rather than pre-joined so the pre-image can name
 * WHICH lockfile moved. The hash still consumes the joined `file:digest` form -
 * see {@link lockfileHashLine}, the one place that form is built.
 */
async function hashLockfiles(projectRoot: string): Promise<LockfileDigest[]> {
  const results: LockfileDigest[] = [];

  for (const lockfile of LOCKFILES.sort()) {
    const lockPath = path.join(projectRoot, lockfile);
    try {
      const content = await fs.promises.readFile(lockPath, 'utf8');
      const digest = crypto.createHash('sha256').update(content).digest('hex');
      results.push({ file: lockfile, digest });
    } catch {
      // Lockfile absent - skip.
    }
  }

  return results;
}

/** The exact `file:digest` string a lockfile contributes to the hash. */
function lockfileHashLine({ file, digest }: LockfileDigest): string {
  return `${file}:${digest}`;
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
