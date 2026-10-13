/**
 * Computes the BASE FINGERPRINTS - one stable hash per platform over that
 * platform's native inputs, IGNORING version/build-number changes. A native
 * change moves the fingerprint of its own platform only, so the next push
 * rebuilds that platform alone.
 *
 * Three layers per platform, combined into a final SHA-256:
 *
 *   Layer 1 – @expo/fingerprint over the platform alone, with version suppression
 *     Managed: SourceSkips.ExpoConfigVersions + ExpoConfigRuntimeVersionIfString
 *     Bare:    streaming fileHookTransform that strips version lines from
 *              *.plist (CFBundleVersion / MARKETING_VERSION) and build.gradle*
 *              (versionName / versionCode).
 *
 *   Layer 2 – Augmented native sources @expo/fingerprint misses
 *     SHA of the platform's native lockfiles (iOS: Podfile.lock, Gemfile.lock),
 *     plus the SORTED native-module set the platform links (name + installed
 *     version). The JavaScript lockfiles are left out: a JavaScript-only library
 *     bump changes no app build, and Layer 1 already hashes every native
 *     module's own folder.
 *
 *   Layer 3 – Workflow detection
 *     "bare" when the project commits android/app/build.gradle or ios/; a native
 *     folder git does not track was generated (by `expo prebuild`), so the
 *     project stays "managed". Selects which Layer-1 suppression to apply.
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
import type { BaseSourceFile, Platform } from '@sherlo/api-types';
import { SHERLO_BUILD_FOR_PUSH } from '../../commands/test/constants';
import { PLATFORMS } from '../../constants';
import { readProjectJson } from '../projectJson';
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
  /** Project-relative lockfile path, e.g. `ios/Podfile.lock`. */
  file: string;
  /** sha256 of the lockfile's bytes. */
  digest: string;
};

/**
 * The INPUTS one platform's base fingerprint was computed over - the pre-image.
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
  /** Layer-2 native modules as sorted `name@version` entries. */
  autolinkedModules: string[];
  /**
   * Every file inside a native folder Layer 1 hashed whole (a bare project's
   * `android` or `ios`), one hash each, so the list of native changes can name
   * the file that changed rather than the folder. NEVER hashed into the base
   * fingerprint: the folder's own hash already covers these files.
   */
  nativeFolderFiles: BaseSourceFile[];
};

/** One platform's base fingerprint. */
export type BaseFingerprintResult = {
  /** The computed base fingerprint hash, or null when unrecoverable. */
  hash: string | null;
  /**
   * The inputs `hash` was computed over. Present exactly when `hash` is - an
   * unrecoverable fingerprint has no pre-image to report.
   */
  preimage?: BaseFingerprintPreimage;
  /**
   * The native fingerprint of the WHOLE project, both platforms - the one number
   * Diff Scope compares between builds, so it is the same on both platforms'
   * results. Made of each platform's sanitized Layer-1 hash (version-suppressed,
   * computed under the deterministic env), so it is sourced from the SINGLE
   * fingerprint computation of the process rather than from a second, raw
   * `createFingerprintAsync` call (SHERLO-1756). `undefined` whenever the base
   * fingerprint is unrecoverable (`hash: null`).
   */
  nativeFingerprint?: string;
  /** Human-readable description of what happened. */
  debugMessage?: string;
};

/** One base fingerprint per platform: each platform's app build is reused or rebuilt on its own. */
export type BaseFingerprints = Record<Platform, BaseFingerprintResult>;

export type ComputeBaseFingerprintOptions = {
  /**
   * The CLI command that triggered this computation (e.g. 'test'). Recorded on the reporting breadcrumb so a reported failure names
   * its caller. Has no effect on the computed hash.
   */
  command?: string;
};

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
 *     ever `await`ed as a single standalone call by each of its callers. None
 *     wraps it in `Promise.all`/`Promise.race` or runs other env-reading/subprocess
 *     work concurrently during the compute. The swap window is also kept as
 *     narrow as possible - only the library calls are wrapped.
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

/**
 * Compute each platform's base fingerprint for the project at `projectRoot`.
 *
 * Every platform's result is `{ hash: null }` with a `debugMessage` when the
 * computation fails (missing @expo/fingerprint, an uninstalled dependency, …).
 * Callers MUST treat a null hash as "stageable flow unavailable" for that
 * platform and print the debugMessage.
 *
 * DETERMINISM CONTRACT (SHERLO-1744, SHERLO-1746): over an identical tree, this
 * MUST return the SAME hashes no matter which command called it. Three inputs used
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
 *      swap in the same deterministic env around the library calls (see
 *      {@link withDeterministicEnv}).
 *
 * `sherlo fingerprint --verbose` prints the full per-layer breakdown - every
 * source, lockfile and native module behind each hash.
 */
export async function computeBaseFingerprint(
  projectRoot: string,
  options: ComputeBaseFingerprintOptions = {}
): Promise<BaseFingerprints> {
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

  // Honesty gate, before any layer runs: every layer below reads INSTALLED
  // state - lockfile bytes, and an autolinking subprocess that resolves
  // against node_modules - never package.json's declared dependency list
  // directly. A dependency just added to package.json but not yet installed is
  // therefore invisible to every layer: the computed hash would equal what it
  // was before the addition, a silent (and wrong) "unchanged" answer for a tree
  // whose native identity may have just changed. Refusing to compute here,
  // rather than returning that stale match, is what lets a caller treat this
  // tree's native identity as UNKNOWN - which every caller already treats as
  // "assume changed" - instead of as confirmed-unchanged.
  const uninstalledDependency = findUninstalledDependency(resolvedProjectRoot);
  if (uninstalledDependency) {
    return unavailableOnEveryPlatform(
      `package.json declares "${uninstalledDependency}", which is not installed in ` +
        'node_modules; the native identity cannot be honestly computed until dependencies are installed.'
    );
  }

  // ------------------------------------------------------------------
  // Layer 3 - workflow detection (must happen first so Layers 1-2 can
  //           adapt to the project shape).
  // ------------------------------------------------------------------
  const workflow = await detectWorkflow(resolvedProjectRoot);

  // ------------------------------------------------------------------
  // Layer 1 - @expo/fingerprint over each platform alone, with version
  //           suppression.
  // ------------------------------------------------------------------
  let layer1: Record<Platform, Fingerprint>;

  try {
    // Lazy, fail-soft load: a missing/broken @expo/fingerprint install rejects
    // here and is caught below, degrading to hash:null instead of crashing.
    const expoFingerprint = await loadExpoFingerprint();

    // Layer 1 (SHERLO-1746): swap in the deterministic env around the library
    // calls so the `ExpoConfigLoader.js` subprocess @expo/fingerprint spawns
    // internally cannot inherit the per-command ambient env. Layer 2 handles its
    // own env via `runShellCommand` (`envMode: 'replace'`) and is NOT wrapped.
    layer1 = await withDeterministicEnv(async () => ({
      android: await createPlatformFingerprint({
        expoFingerprint,
        projectRoot: resolvedProjectRoot,
        workflow,
        platform: 'android',
      }),
      ios: await createPlatformFingerprint({
        expoFingerprint,
        projectRoot: resolvedProjectRoot,
        workflow,
        platform: 'ios',
      }),
    }));
  } catch (err) {
    // @expo/fingerprint may not be installed, or the project may have no
    // native dirs.  Fail-soft - return null and let the caller proceed.
    return unavailableOnEveryPlatform(
      `@expo/fingerprint unavailable or failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (PLATFORMS.some((platform) => !layer1[platform].hash)) {
    return unavailableOnEveryPlatform('@expo/fingerprint returned an empty hash');
  }

  const nativeFingerprint = nativeFingerprintOf({
    android: layer1.android.hash,
    ios: layer1.ios.hash,
  });

  // ------------------------------------------------------------------
  // Layer 2 - augmented native sources.
  // ------------------------------------------------------------------
  const autolinkedModulesOf = await getAutolinkedModules(resolvedProjectRoot, workflow);

  const fingerprints = {} as BaseFingerprints;
  for (const platform of PLATFORMS) {
    const lockfiles = await hashLockfiles(resolvedProjectRoot, platform);
    const autolinkedModules = autolinkedModulesOf[platform];

    fingerprints[platform] = {
      hash: combineLayers({
        layer1Hash: layer1[platform].hash,
        lockfiles,
        autolinkedModules,
        workflow,
      }),
      nativeFingerprint,
      preimage: {
        workflow,
        nativeSources: sourceDigestsOf(layer1[platform]),
        lockfiles,
        autolinkedModules,
        nativeFolderFiles: nativeFolderFilesOf(layer1[platform]),
      },
    };
  }

  return fingerprints;
}

/** Every platform's answer when the fingerprint cannot be computed at all, with the one reason. */
function unavailableOnEveryPlatform(debugMessage: string): BaseFingerprints {
  return {
    android: { hash: null, debugMessage },
    ios: { hash: null, debugMessage },
  };
}

/**
 * One platform's Layer 1: `@expo/fingerprint` told to read that platform's native
 * files alone, so an edit to the other platform's folder cannot move it.
 *
 * `debug: true` adds nothing to the hash: it only hands back, under each folder
 * source's `debugInfo`, the per-file hashes the folder hash was made of - kept for
 * the list of native changes ({@link nativeFolderFilesOf}).
 */
function createPlatformFingerprint({
  expoFingerprint,
  projectRoot,
  workflow,
  platform,
}: {
  expoFingerprint: ExpoFingerprintModule;
  projectRoot: string;
  workflow: Workflow;
  platform: Platform;
}): Promise<Fingerprint> {
  const { createFingerprintAsync, SourceSkips } = expoFingerprint;

  const versionSuppression: FingerprintOptions =
    workflow === 'managed'
      ? {
          sourceSkips:
            SourceSkips.ExpoConfigVersions | SourceSkips.ExpoConfigRuntimeVersionIfString,
        }
      : {
          fileHookTransform: createVersionStrippingTransform(),
        };

  return createFingerprintAsync(projectRoot, {
    ...versionSuppression,
    platforms: [platform],
    debug: true,
  });
}

/**
 * The sources `@expo/fingerprint` already computed, reduced to identifier + hash.
 * A `contents` source's VALUE is deliberately dropped: it is the resolved
 * autolinking output or the resolved `expo config --json`, and a resolved Expo
 * config routinely holds customer secrets in `extra`. See
 * {@link FingerprintSourceDigest} - do not widen this mapping.
 */
function sourceDigestsOf(fingerprint: Fingerprint): FingerprintSourceDigest[] {
  return (fingerprint.sources ?? []).map((source: FingerprintSource) => ({
    type: source.type,
    id: source.type === 'contents' ? source.id : source.filePath,
    hash: source.hash,
  }));
}

/** A folder `debugInfo` entry: a file has a hash, a folder has children too. */
type DebugInfoEntry = { path: string; hash: string; children?: (DebugInfoEntry | undefined)[] };

/**
 * The files of each native folder Layer 1 hashed whole (`android`, `ios`), one hash
 * each, flattened from the source's `debugInfo` - the very hashes the folder hash
 * was made of, under the same ignore list and version-stripping transform.
 */
function nativeFolderFilesOf(fingerprint: Fingerprint): BaseSourceFile[] {
  const files: BaseSourceFile[] = [];

  function collect(entry: DebugInfoEntry | undefined): void {
    if (!entry) return;
    if (entry.children === undefined) {
      files.push({ path: entry.path, hash: entry.hash });
      return;
    }
    for (const child of entry.children) collect(child);
  }

  for (const source of fingerprint.sources ?? []) {
    const isNativeFolder =
      source.type === 'dir' && (PLATFORMS as readonly string[]).includes(source.filePath);
    if (isNativeFolder) collect(source.debugInfo as DebugInfoEntry | undefined);
  }

  return files;
}

/**
 * The native fingerprint of the whole project: each platform's Layer-1 hash, in a
 * fixed order. One number, so Diff Scope can tell that native code moved anywhere.
 */
function nativeFingerprintOf(layer1Hashes: Record<Platform, string>): string {
  const combined = crypto.createHash('sha256');
  for (const platform of PLATFORMS) {
    combined.update(`${platform}:${layer1Hashes[platform]}|`);
  }
  return combined.digest('hex');
}

/** One platform's base fingerprint: its three layers combined into a single stable hash. */
function combineLayers({
  layer1Hash,
  lockfiles,
  autolinkedModules,
  workflow,
}: {
  layer1Hash: string;
  lockfiles: LockfileDigest[];
  autolinkedModules: string[];
  workflow: Workflow;
}): string {
  const combined = crypto.createHash('sha256');

  combined.update('layer1:');
  combined.update(layer1Hash);

  combined.update('|lockfiles:');
  for (const lockfile of lockfiles) {
    combined.update(lockfileHashLine(lockfile));
  }

  combined.update('|autolinked:');
  combined.update(autolinkedModules.join('\n'));

  combined.update('|workflow:');
  combined.update(workflow);

  return combined.digest('hex');
}

// ---------------------------------------------------------------------------
// Honesty gate - a declared dependency node_modules doesn't have yet
// ---------------------------------------------------------------------------

/**
 * The folder `name` is installed in, under `fromDir`'s own node_modules or one
 * of its ancestors' - the same lookup order Node's own `require` uses for
 * non-PnP installs - or null when it is not installed. A single fixed
 * `<projectRoot>/node_modules/<name>` check would false-positive in a hoisting
 * monorepo, where a project's own dependencies commonly resolve from a parent
 * workspace root instead.
 */
function findInstalledPackageFolder(fromDir: string, name: string): string | null {
  let dir = fromDir;
  while (true) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The first dependency `package.json` declares that isn't actually installed,
 * or null when every declared dependency resolves (or there is no readable
 * package.json - Layer 1 below will fail on that in its own, already-handled
 * way).
 */
function findUninstalledDependency(projectRoot: string): string | null {
  const packageJson: { dependencies?: Record<string, string> } | undefined = readProjectJson(
    projectRoot,
    'package.json'
  );
  if (!packageJson) return null;

  for (const name of Object.keys(packageJson.dependencies ?? {})) {
    if (!findInstalledPackageFolder(projectRoot, name)) return name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Layer 3 - workflow detection
// ---------------------------------------------------------------------------

export type Workflow = 'managed' | 'bare';

/**
 * Bare when the project has a native project of its own: an Android app module or
 * an iOS folder that the project commits. A native folder git does not track was
 * generated by `expo prebuild` - Sherlo's own build runs it - so the project stays
 * managed after it. A project git cannot answer for (no repository, no commit yet)
 * is judged by the folders alone.
 */
async function detectWorkflow(projectRoot: string): Promise<Workflow> {
  const nativeFoldersPresent = PLATFORMS.filter((folder) => hasNativeProject(projectRoot, folder));
  if (nativeFoldersPresent.length === 0) return 'managed';

  const committedFolders = await nativeFoldersTheProjectCommits(projectRoot);
  if (committedFolders === null) return 'bare';

  return nativeFoldersPresent.some((folder) => committedFolders.includes(folder))
    ? 'bare'
    : 'managed';
}

/** Whether `folder` (`android` or `ios`) holds a native project on disk. */
function hasNativeProject(projectRoot: string, folder: Platform): boolean {
  if (folder === 'ios') return fs.existsSync(path.join(projectRoot, 'ios'));
  return (
    fs.existsSync(path.join(projectRoot, 'android', 'app', 'build.gradle')) ||
    fs.existsSync(path.join(projectRoot, 'android', 'app', 'build.gradle.kts'))
  );
}

/**
 * The native folders (`android`, `ios`) the project's last commit holds, or null
 * when git cannot say: not a repository, no commit yet, or no git at all.
 */
async function nativeFoldersTheProjectCommits(projectRoot: string): Promise<string[] | null> {
  try {
    const output = await runShellCommand({
      command: `git ls-tree -d --name-only HEAD -- ${PLATFORMS.join(' ')}`,
      projectRoot,
    });
    return output.split('\n').filter((line) => line.length > 0);
  } catch {
    return null;
  }
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
// Layer 2 helpers - native lockfiles
// ---------------------------------------------------------------------------

/**
 * Each platform's native lockfiles, sorted. CocoaPods pins the iOS native
 * dependencies in `ios/Podfile.lock`, and the Gemfile.lock pins CocoaPods itself.
 * Android pins its native dependencies in no lockfile Sherlo reads. The
 * JavaScript lockfiles are not here: a JavaScript-only library bump changes no
 * app build, and every native module's own folder is hashed by Layer 1.
 */
const NATIVE_LOCKFILES: Record<Platform, string[]> = {
  android: [],
  ios: ['Gemfile.lock', 'ios/Podfile.lock'],
};

/**
 * Returns the filename and SHA-256 of each of the platform's native lockfiles
 * present in the project, sorted by filename for determinism.
 *
 * The pair is kept structured rather than pre-joined so the pre-image can name
 * WHICH lockfile moved. The hash still consumes the joined `file:digest` form -
 * see {@link lockfileHashLine}, the one place that form is built.
 */
async function hashLockfiles(projectRoot: string, platform: Platform): Promise<LockfileDigest[]> {
  const results: LockfileDigest[] = [];

  for (const lockfile of NATIVE_LOCKFILES[platform]) {
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

/** Each platform's sorted native modules, as `name@version` entries. */
type ModulesByPlatform = Record<Platform, string[]>;

const NO_MODULES: ModulesByPlatform = { android: [], ios: [] };

/**
 * The sorted native-module set each platform links: `name@version` entries, the
 * version read from the module's installed package.json.
 *
 * Bare projects use `npx react-native config` (one answer for both platforms);
 * managed projects use `npx expo-modules-autolinking resolve --platform <platform>`.
 * Falls back to empty lists when neither command succeeds (best-effort).
 *
 * The subprocess runs with a deterministic, command-independent environment -
 * see {@link buildDeterministicEnv}.
 */
async function getAutolinkedModules(
  projectRoot: string,
  workflow: Workflow
): Promise<ModulesByPlatform> {
  if (workflow === 'bare') {
    return getBareAutolinkedModules(projectRoot);
  }
  return {
    android: await getManagedAutolinkedModules(projectRoot, 'android'),
    ios: await getManagedAutolinkedModules(projectRoot, 'ios'),
  };
}

/** The version of an installed package, read from its own package.json. */
function installedVersionOf(packageFolder: string | null): string {
  if (!packageFolder) return 'unknown';
  const version: unknown = readProjectJson(packageFolder, 'package.json')?.version;
  return typeof version === 'string' ? version : 'unknown';
}

/**
 * `react-native config` lists every dependency with what it links per platform: a
 * platform it has nothing for is `null` there, so it does not count for that one.
 */
async function getBareAutolinkedModules(projectRoot: string): Promise<ModulesByPlatform> {
  try {
    const output = await runShellCommand({
      command: 'npx react-native config',
      projectRoot,
      env: buildDeterministicEnv(),
      envMode: 'replace',
    });
    const config = JSON.parse(output);
    const dependencies: {
      name: string;
      root?: string;
      platforms?: Partial<Record<Platform, unknown>>;
    }[] = Object.values(config?.dependencies ?? {});

    const modulesOf = (platform: Platform): string[] =>
      dependencies
        .filter((dependency) => dependency.platforms?.[platform] !== null)
        .map((dependency) => {
          const packageFolder =
            dependency.root ?? findInstalledPackageFolder(projectRoot, dependency.name);
          return `${dependency.name}@${installedVersionOf(packageFolder)}`;
        })
        .sort();

    return { android: modulesOf('android'), ios: modulesOf('ios') };
  } catch {
    return NO_MODULES;
  }
}

async function getManagedAutolinkedModules(
  projectRoot: string,
  platform: Platform
): Promise<string[]> {
  try {
    // expo-modules-autolinking resolve answers `{ modules: [...] }`, one
    // descriptor per native module the platform links.
    const output = await runShellCommand({
      command: `npx expo-modules-autolinking resolve --json --platform ${platform}`,
      projectRoot,
      env: buildDeterministicEnv(),
      envMode: 'replace',
    });
    const modules: { packageName?: string }[] = JSON.parse(output)?.modules ?? [];

    return modules
      .flatMap((module) => (module.packageName ? [module.packageName] : []))
      .map((name) => `${name}@${installedVersionOf(findInstalledPackageFolder(projectRoot, name))}`)
      .sort();
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
      return modules.sort();
    } catch {
      return [];
    }
  }
}
