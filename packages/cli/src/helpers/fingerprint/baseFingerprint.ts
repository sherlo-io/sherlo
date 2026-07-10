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

/**
 * Compute the base fingerprint for the project at `projectRoot`.
 *
 * Returns `{ hash: null }` with a `debugMessage` when the computation fails
 * (missing @expo/fingerprint, no native dirs, …).  Callers MUST treat a null
 * hash as "stageable flow unavailable" and print the debugMessage.
 */
export async function computeBaseFingerprint(projectRoot: string): Promise<BaseFingerprintResult> {
  // ------------------------------------------------------------------
  // Layer 3 - workflow detection (must happen first so Layers 1-2 can
  //           adapt to the project shape).
  // ------------------------------------------------------------------
  const workflow = detectWorkflow(projectRoot);

  // ------------------------------------------------------------------
  // Layer 1 - @expo/fingerprint with version suppression.
  // ------------------------------------------------------------------
  let layer1Hash: string | null = null;

  try {
    // Lazy, fail-soft load: a missing/broken @expo/fingerprint install rejects
    // here and is caught below, degrading to hash:null instead of crashing.
    const { createFingerprintAsync, SourceSkips } = await loadExpoFingerprint();

    const options: FingerprintOptions =
      workflow === 'managed'
        ? {
            sourceSkips:
              SourceSkips.ExpoConfigVersions | SourceSkips.ExpoConfigRuntimeVersionIfString,
          }
        : {
            fileHookTransform: createVersionStrippingTransform(),
          };

    const fingerprint = await createFingerprintAsync(projectRoot, options);
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
  const lockfileHashes = await hashLockfiles(projectRoot);
  const autolinkedModules = await getAutolinkedModules(projectRoot, workflow);

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

  return { hash: combined.digest('hex') };
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
 * Returns a sorted, stable string representation of the autolinked native
 * module set: "name@version" pairs joined with newlines.
 *
 * Bare projects use `npx react-native config`; managed projects use
 * `npx expo-modules-autolinking resolve`.  Falls back to an empty string when
 * neither command succeeds (best-effort).
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
      });
      const config = JSON.parse(output);
      const modules: string[] = config?.expo?.plugins ?? [];
      return modules.sort().join('\n');
    } catch {
      return '';
    }
  }
}
