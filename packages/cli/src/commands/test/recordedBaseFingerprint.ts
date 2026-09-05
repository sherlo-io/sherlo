/**
 * THE BASE FINGERPRINT OF A SUPPLIED BUNDLE - recorded at emit, verified at accept.
 *
 * `sherlo test` routes and registers on the base fingerprint, and computing one
 * needs the project INSTALLED: `@expo/fingerprint` walks native module
 * directories under node_modules and evaluates the Expo config, and the
 * autolinking layer shells out to `expo-modules-autolinking` / `react-native
 * config`. A machine that accepts a prebuilt bundle has none of that - it never
 * ran an install, because it bundles nothing - so it cannot compute the number.
 *
 * It does not have to. The base fingerprint is a pure function of the tree:
 *
 *   - the native files and directories under the project (`ios/`, `android/`,
 *     the app config, patches) - `@expo/fingerprint`'s file and dir sources;
 *   - the resolved Expo config and the autolinked module set, which are functions
 *     of the app config files plus the INSTALLED packages;
 *   - the lockfiles.
 *
 * Every input under node_modules is a function of the resolved package set, and
 * the sidecar's dependency closure already REFUSES a bundle whose resolved set
 * differs from the accepting tree's. Everything else is a file in the checkout.
 * So the emitting machine records the fingerprint it computed together with a
 * digest of those checkout files, and the acceptor recomputes the digest from its
 * own tree: equal digest plus equal dependency closure means the accepting tree
 * would have produced the same fingerprint, had it been able to compute one.
 *
 * WHAT IS TRUSTED, EXACTLY: the recorded `hash` and `nativeFingerprint`, and
 * only after (1) this file's digest of the recorded native input paths matches
 * the accepting tree and (2) the supplied-bundle road accepts the sidecar's
 * project identity, dependency closure included. A digest mismatch is not a
 * refusal - a native-only change is a legitimate thing to test - it means the
 * fingerprint has to be COMPUTED here, which needs the install, and the run says
 * so when it cannot.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Platform } from '@sherlo/api-types';
import { computeBaseFingerprint, type BaseFingerprintResult } from '../../helpers/fingerprint';
import type { BaseFingerprintPreimage } from '../../helpers/fingerprint/baseFingerprint';
import { parseBundleSidecar, sha256OfBuffer, sidecarFileName } from './bundleSidecar';

export type RecordedBaseFingerprint = {
  hash: string;
  /** The version-suppressed `@expo/fingerprint` hash the base was built on. */
  nativeFingerprint: string;
  /** The checkout files the fingerprint depends on, and their digest at emit. */
  nativeInputs: {
    /** Project-relative paths, sorted; a directory stands for its whole tree. */
    paths: string[];
    digest: string;
  };
};

/**
 * Directory names skipped when digesting a native directory - build output and
 * caches that `@expo/fingerprint` skips too, plus `node_modules` (vouched for by
 * the dependency closure) and `.git`. A build machine has them, a checkout does
 * not, and neither is an input to the fingerprint.
 */
const SKIPPED_DIRECTORY_NAMES = new Set([
  'node_modules',
  '.git',
  'build',
  '.cxx',
  '.gradle',
  'Pods',
  'DerivedData',
  'xcuserdata',
]);

const SKIPPED_FILE_NAMES = new Set(['.DS_Store']);

/**
 * The app config files the resolved Expo config is evaluated from. Listed
 * explicitly because `@expo/fingerprint` reports the RESOLVED config as a
 * `contents` source, not the files it read.
 */
const APP_CONFIG_FILES = [
  'package.json',
  'app.json',
  'app.config.js',
  'app.config.ts',
  'app.config.cjs',
  'app.config.mjs',
];

// ---------------------------------------------------------------------------
// Emit side
// ---------------------------------------------------------------------------

/**
 * What the sidecar records about the base fingerprint the emitting machine
 * computed, or null when it computed none.
 */
export function recordBaseFingerprint(
  fingerprint: BaseFingerprintResult,
  projectRoot: string
): RecordedBaseFingerprint | null {
  if (!fingerprint.hash || !fingerprint.nativeFingerprint || !fingerprint.preimage) return null;

  const paths = nativeInputPaths(fingerprint.preimage, projectRoot);
  return {
    hash: fingerprint.hash,
    nativeFingerprint: fingerprint.nativeFingerprint,
    nativeInputs: { paths, digest: digestNativeInputs({ projectRoot, paths }) },
  };
}

/**
 * The checkout paths the fingerprint was computed over: every file and dir source
 * outside node_modules, every lockfile, and the app config files that exist.
 */
export function nativeInputPaths(preimage: BaseFingerprintPreimage, projectRoot: string): string[] {
  const paths = new Set<string>();

  for (const source of preimage.nativeSources) {
    if (source.type === 'contents') continue;
    if (source.id.split(/[\\/]/).includes('node_modules')) continue;
    paths.add(source.id);
  }
  for (const lockfile of preimage.lockfiles) {
    paths.add(lockfile.file);
  }
  for (const configFile of APP_CONFIG_FILES) {
    if (fs.existsSync(path.join(projectRoot, configFile))) paths.add(configFile);
  }

  return [...paths].sort();
}

/**
 * One digest over the named paths as they are in the tree now: a file by its
 * bytes, a directory by every file under it (build output skipped), a path that
 * does not exist as `missing`. The same function runs at emit and at accept.
 */
export function digestNativeInputs({
  projectRoot,
  paths,
}: {
  projectRoot: string;
  paths: string[];
}): string {
  const hash = crypto.createHash('sha256');

  for (const inputPath of [...paths].sort()) {
    hash.update(`${inputPath}:${digestPath(path.resolve(projectRoot, inputPath))}\n`);
  }

  return hash.digest('hex');
}

function digestPath(absolutePath: string): string {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    return 'missing';
  }

  if (stat.isDirectory()) return digestDirectory(absolutePath);
  return sha256OfBuffer(fs.readFileSync(absolutePath));
}

function digestDirectory(directory: string): string {
  const hash = crypto.createHash('sha256');

  function walk(dir: string, relativeDir: string): void {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORY_NAMES.has(entry.name)) walk(path.join(dir, entry.name), relativePath);
        continue;
      }
      if (!entry.isFile() || SKIPPED_FILE_NAMES.has(entry.name)) continue;
      hash.update(`${relativePath}:${sha256OfBuffer(fs.readFileSync(path.join(dir, entry.name)))}\n`);
    }
  }

  walk(directory, '');
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// Accept side
// ---------------------------------------------------------------------------

/**
 * The base fingerprint for a run that supplies its bundle: the sidecar's recorded
 * one when its native inputs still match this tree, otherwise a fresh
 * computation - which needs the project installed, and says so when it fails.
 *
 * Every tested platform's sidecar must record the same fingerprint: the number
 * is a property of the tree, not of a platform, and two sidecars that disagree
 * came from two different trees.
 *
 * Reads the sidecars fail-soft: a directory the supplied-bundle road is about to
 * refuse (missing files, an unreadable sidecar) is left for that road to refuse
 * with its full message, and the fingerprint is simply computed here.
 */
export async function resolveBaseFingerprintForSuppliedBundle({
  bundleDir,
  projectRoot,
  platforms,
  command,
}: {
  bundleDir: string;
  projectRoot: string;
  platforms: Platform[];
  command: string;
}): Promise<BaseFingerprintResult> {
  const recorded = readRecordedBaseFingerprints({ bundleDir, platforms });

  if (recorded.length === platforms.length && recorded.length > 0) {
    const [first] = recorded;
    const allAgree = recorded.every((entry) => entry.hash === first.hash);
    const inputsUnchanged =
      allAgree &&
      digestNativeInputs({ projectRoot, paths: first.nativeInputs.paths }) ===
        first.nativeInputs.digest;

    if (inputsUnchanged) {
      return {
        hash: first.hash,
        nativeFingerprint: first.nativeFingerprint,
        debugMessage:
          'base fingerprint taken from the supplied bundle: its native inputs are unchanged in this tree',
      };
    }
  }

  const computed = await computeBaseFingerprint(projectRoot, { command });
  if (computed.hash) return computed;

  return {
    ...computed,
    debugMessage:
      `${computed.debugMessage ?? 'the base fingerprint could not be computed'} ` +
      '(the supplied bundle recorded no fingerprint this tree can reuse: ' +
      `${describeWhyNotReused(recorded, platforms)}, so it had to be computed here, ` +
      'which needs the project installed)',
  };
}

function readRecordedBaseFingerprints({
  bundleDir,
  platforms,
}: {
  bundleDir: string;
  platforms: Platform[];
}): RecordedBaseFingerprint[] {
  const recorded: RecordedBaseFingerprint[] = [];

  for (const platform of platforms) {
    const parsed = parseBundleSidecar(path.join(bundleDir, sidecarFileName(platform)));
    if (!parsed.ok || !parsed.sidecar.baseFingerprint) continue;
    recorded.push(parsed.sidecar.baseFingerprint);
  }

  return recorded;
}

function describeWhyNotReused(recorded: RecordedBaseFingerprint[], platforms: Platform[]): string {
  if (recorded.length < platforms.length) {
    return 'not every platform sidecar records one';
  }
  if (recorded.some((entry) => entry.hash !== recorded[0].hash)) {
    return 'the platform sidecars record different fingerprints';
  }
  return 'the native inputs it was computed over have changed in this tree';
}
