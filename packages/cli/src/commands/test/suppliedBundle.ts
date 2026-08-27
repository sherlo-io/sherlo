/**
 * THE SUPPLIED-BUNDLE ROAD - `sherlo test --bundle-dir <dir>`.
 *
 * Bundling is the slowest thing `sherlo test` does, and in CI it is usually the
 * SAME bundle being rebuilt from the same inputs on every cycle. `--bundle-dir`
 * lets a caller who already built it (a monorepo pipeline, a prestage job, our own
 * e2e harness) hand it over instead, and the CLI skips straight to upload.
 *
 * THREE RULES SHAPE EVERY DECISION IN THIS FILE.
 *
 * 1. THE ARTIFACT IS A TRIPLE, NEVER A FILE. A bundle alone is not enough: the
 *    module manifest is a side effect of the Sherlo serializer and cannot be
 *    recovered from bundle bytes. Accept a bundle without one and every run
 *    silently degrades to a full capture - a correctness regression wearing a
 *    performance costume. So all three are required, and a missing manifest is a
 *    refusal rather than the bail-open the built road allows itself.
 *
 * 2. NEVER SILENTLY FALL BACK TO BUNDLING. A caller who asked for supply and got a
 *    rebuild has a broken cache and no signal that it is broken - the run still
 *    passes, just slowly, forever. Every problem here exits loudly instead.
 *
 * 3. REFUSE WITH THE WHOLE LIST, NOT THE FIRST PROBLEM. Mismatches arrive in
 *    clusters (a stale directory is usually stale in four fields at once). Naming
 *    every one of them means the caller fixes them in a single pass rather than
 *    rediscovering the next one on each CI cycle.
 */
import fs from 'fs';
import path from 'path';
import { Platform } from '@sherlo/api-types';
import { emit } from '../../helpers/transcriptSink';
import type { GateMetadataInput } from '../../helpers/fingerprint';
import { FALLBACK_LINE as SHARED_FALLBACK_LINE } from './stagedGateRefusal';
import { inspectBundleArtifacts, type BundleResult } from './buildBundle';
import { validateModuleManifestBuffer } from './readModuleManifest';
import {
  assetsDirName,
  bundleFileName,
  computeAppSourceClosure,
  moduleManifestFileName,
  moduleManifestSourcePaths,
  parseBundleSidecar,
  readProjectIdentity,
  sha256OfBuffer,
  sidecarFileName,
  type PersistedProjectIdentity,
} from './bundleSidecar';

const FALLBACK_LINE = `\n${SHARED_FALLBACK_LINE}`;

/**
 * Resolve one platform's bundle from a supplied directory.
 *
 * Returns exactly the {@link BundleResult} the bundling road would have returned,
 * so everything downstream - the gate, the transcript, the upload - cannot tell
 * which road produced it, and there is no second code path to keep in step.
 *
 * Throws user-facing messages carrying the full-run fallback line.
 */
export async function resolveSuppliedBundle({
  bundleDir,
  projectRoot,
  platform,
  nativeFingerprint,
}: {
  bundleDir: string;
  projectRoot: string;
  platform: Platform;
  /** The base fingerprint of this run, for the advisory pairing note. */
  nativeFingerprint?: string;
}): Promise<{ result: BundleResult; notes: string[] }> {
  const bundlePath = path.join(bundleDir, bundleFileName(platform));
  const assetsDest = path.join(bundleDir, assetsDirName(platform));
  const manifestPath = path.join(bundleDir, moduleManifestFileName(platform));
  const sidecarPath = path.join(bundleDir, sidecarFileName(platform));

  if (!fs.existsSync(bundleDir)) {
    throw new Error(
      `The supplied bundle directory does not exist: ${bundleDir}` +
        '\n\nPoint `--bundle-dir` at a directory produced by `sherlo test --emit-bundle-dir <dir>`.' +
        FALLBACK_LINE
    );
  }

  // ------------------------------------------------------------------
  // 1. The triple must be complete. Report every missing piece at once.
  // ------------------------------------------------------------------
  const missing = [
    { label: 'the bundle', filePath: bundlePath },
    { label: 'the module manifest', filePath: manifestPath },
    { label: 'the sidecar', filePath: sidecarPath },
  ].filter(({ filePath }) => !fs.existsSync(filePath));

  if (missing.length > 0) {
    throw new Error(
      `The supplied bundle directory has no complete ${platform} bundle.\n\n` +
        `Missing:\n${missing.map((m) => `  - ${m.label}: ${m.filePath}`).join('\n')}\n\n` +
        'A supplied bundle is a triple - bundle, module manifest, and sidecar. ' +
        'Without the manifest every run would silently capture every story instead ' +
        'of only what changed, so an incomplete directory is refused rather than ' +
        'quietly rebuilt.\n\n' +
        'Produce a complete directory with `sherlo test --emit-bundle-dir <dir>`.' +
        FALLBACK_LINE
    );
  }

  // ------------------------------------------------------------------
  // 2. Read the sidecar - the only thing that knows what this bundle IS.
  // ------------------------------------------------------------------
  const parseResult = parseBundleSidecar(sidecarPath);
  if (!parseResult.ok) {
    throw new Error(
      `The supplied ${platform} bundle cannot be verified: ${parseResult.message}.\n\n` +
        'A bundle carries no record of the platform, app, or toolchain it was built ' +
        'for, so without a readable sidecar there is nothing to check it against.' +
        FALLBACK_LINE
    );
  }
  const { sidecar } = parseResult;

  // ------------------------------------------------------------------
  // 3. Every mismatch, collected before any is reported.
  // ------------------------------------------------------------------
  const mismatches: string[] = [];

  if (sidecar.platform !== platform) {
    mismatches.push(
      `platform: the sidecar says this bundle was built for ${sidecar.platform}, ` +
        `but it is being supplied as the ${platform} bundle`
    );
  }

  // Integrity, from the bytes. Catches a truncated file, a half-written copy, and
  // a directory whose sidecar and bundle came from different builds.
  const bundleBuffer = fs.readFileSync(bundlePath);
  const bundleHash = sha256OfBuffer(bundleBuffer);
  if (bundleHash !== sidecar.bundle.sha256) {
    mismatches.push(
      `bundle contents: the bundle hashes to ${short(bundleHash)}, ` +
        `but its sidecar recorded ${short(sidecar.bundle.sha256)}`
    );
  }

  const manifestBuffer = fs.readFileSync(manifestPath);
  const manifestHash = sha256OfBuffer(manifestBuffer);
  if (manifestHash !== sidecar.moduleManifest.sha256) {
    mismatches.push(
      `module manifest contents: the manifest hashes to ${short(manifestHash)}, ` +
        `but its sidecar recorded ${short(sidecar.moduleManifest.sha256)}`
    );
  }

  const suppliedAssets = fs.existsSync(assetsDest) ? assetsDest : undefined;
  const assetInventory = suppliedAssets ? collectAssetInventory(suppliedAssets) : [];
  const recordedInventory = sidecar.assets.inventory ?? [];
  if (JSON.stringify(assetInventory) !== JSON.stringify(recordedInventory)) {
    mismatches.push(
      `assets: the directory holds ${assetInventory.length} asset(s), ` +
        `but its sidecar recorded ${recordedInventory.length}`
    );
  }

  // The manifest must be well-formed before anything can be asked of it. It is
  // also what names the app's source files, so this has to resolve before the
  // staleness check below.
  const moduleManifest = validateModuleManifestBuffer(manifestBuffer);
  if (!moduleManifest) {
    throw new Error(
      `The supplied ${platform} module manifest at ${manifestPath} is not a valid ` +
        'manifest (expected version, header, moduleHashes, storyClosures).\n\n' +
        'Re-emit the bundle directory with `sherlo test --emit-bundle-dir <dir>`.' +
        FALLBACK_LINE
    );
  }

  // Identity, against the CURRENT project. This is what catches the failure the
  // bytes never can: a bundle that is perfectly well-formed and built from the
  // wrong app, the wrong React Native, or the wrong toolchain.
  const project = await readProjectIdentity({ projectRoot, platform });
  mismatches.push(...compareProjectIdentity({ recorded: sidecar.project, current: project }));

  // STALENESS - the check every other field misses. A bundle built before someone
  // edited a screen matches this project in every respect except the one that
  // matters, and running it would capture the code as it used to be.
  const appSource = computeAppSourceClosure({
    projectRoot,
    modulePaths: moduleManifestSourcePaths(moduleManifest),
  });
  if (appSource.hash !== sidecar.appSource.hash) {
    mismatches.push(
      "app source: this project's source has changed since the bundle was built " +
        `(${appSource.fileCount} source file(s) in the bundle's module graph now hash to ` +
        `${short(appSource.hash)}, the bundle recorded ${short(sidecar.appSource.hash)}) - ` +
        'running it would test the code as it was BEFORE those edits'
    );
  }

  if (mismatches.length > 0) {
    throw new Error(
      `The supplied ${platform} bundle does not match this project.\n\n` +
        `${mismatches.map((m) => `  - ${m}`).join('\n')}\n\n` +
        'Running a bundle built from different inputs would test code that is not ' +
        'this commit, so it is refused rather than uploaded. Re-emit the bundle ' +
        'directory from this project with `sherlo test --emit-bundle-dir <dir>`.' +
        FALLBACK_LINE
    );
  }

  // ------------------------------------------------------------------
  // 4. The SAME acceptance checks a freshly built bundle passes.
  // ------------------------------------------------------------------
  const result = inspectBundleArtifacts({
    bundlePath,
    ...(suppliedAssets ? { assetsDest: suppliedAssets } : {}),
    bundler: sidecar.bundle.bundler,
    moduleManifest,
  });

  // ------------------------------------------------------------------
  // 6. Advisory only: the native shell this bundle was built beside.
  //
  //    NOT a refusal, deliberately. A bundle does not depend on the native shell -
  //    only the pairing does, and the staged gate judges pairing on every run. If
  //    a native-only change invalidated every supplied bundle, the cache would be
  //    useless in exactly the case it is most valuable.
  // ------------------------------------------------------------------
  const notes: string[] = [];
  if (
    nativeFingerprint &&
    sidecar.nativeFingerprint &&
    sidecar.nativeFingerprint !== nativeFingerprint
  ) {
    notes.push(
      `built beside a different native base (${short(sidecar.nativeFingerprint)}); ` +
        'the staged gate still judges this pairing'
    );
  }

  return { result, notes };
}

/**
 * Resolve every tested platform's bundle from a supplied directory, and build the
 * gate metadata alongside each - the supplied road's counterpart to the bundling
 * loop, filling the same two maps the staged run consumes.
 *
 * It is a separate loop rather than a substituted effect inside the bundling loop
 * because the two roads SAY different things. The bundling loop prints "Building
 * android bundle..." and "✓ Bundle:"; a run that built nothing must not print
 * either, or its transcript claims work it did not do. The acceptance logic - the
 * part where a bug would be dangerous - is shared through
 * {@link inspectBundleArtifacts}; only the narration differs, and it should.
 */
export async function resolveSuppliedBundles({
  bundleDir,
  projectRoot,
  platformsToTest,
  nativeFingerprint,
  gateMetadataFor,
}: {
  bundleDir: string;
  projectRoot: string;
  platformsToTest: Platform[];
  nativeFingerprint?: string;
  gateMetadataFor: (
    projectRoot: string,
    platform: Platform,
    bundleResult: BundleResult
  ) => Promise<GateMetadataInput>;
}): Promise<{
  results: Partial<Record<Platform, BundleResult>>;
  gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput };
}> {
  const results: Partial<Record<Platform, BundleResult>> = {};
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};

  for (const platform of platformsToTest) {
    const { result, notes } = await resolveSuppliedBundle({
      bundleDir,
      projectRoot,
      platform,
      ...(nativeFingerprint ? { nativeFingerprint } : {}),
    });

    results[platform] = result;

    emit({
      kind: 'platform-bundle-supplied',
      bundlePath: result.bundlePath,
      bundleSizeMb: result.bundleSizeMb,
      bundleFormat: result.bundleFormat,
      bundler: result.bundler,
    });
    if (result.assetsDest) {
      emit({ kind: 'platform-bundle-assets', assetCount: result.assetInventory.length });
    }
    for (const note of notes) {
      emit({ kind: 'platform-bundle-supplied-note', note });
    }

    gateMetadata[platform] = await gateMetadataFor(projectRoot, platform, result);
  }

  return { results, gateMetadata };
}

/**
 * Compare a sidecar's recorded project identity against the live project.
 *
 * Field by field, in a fixed order, so the same set of problems always reads the
 * same way. A field that is absent on BOTH sides matches: two projects that both
 * lack Expo genuinely agree about Expo, and reporting that as a difference would
 * bury the real mismatches under noise.
 */
export function compareProjectIdentity({
  recorded,
  current,
}: {
  recorded: PersistedProjectIdentity;
  current: PersistedProjectIdentity;
}): string[] {
  const mismatches: string[] = [];

  const fields: { key: keyof PersistedProjectIdentity; label: string }[] = [
    { key: 'reactNativeVersion', label: 'React Native version' },
    { key: 'expoSdkVersion', label: 'Expo SDK version' },
    { key: 'requiredSdkProtocolVersion', label: 'Sherlo SDK protocol version' },
    { key: 'engineClass', label: 'JS engine' },
    { key: 'babelConfigDigest', label: 'Babel config' },
    { key: 'metroVersion', label: 'Metro version' },
  ];

  for (const { key, label } of fields) {
    const recordedValue = recorded[key] as string | null;
    const currentValue = current[key] as string | null;
    if (recordedValue === currentValue) continue;

    mismatches.push(
      `${label}: the bundle was built with ${describe(recordedValue, key)}, ` +
        `this project has ${describe(currentValue, key)}`
    );
  }

  // The dependency closure is two fields, and the SOURCE difference is reported on
  // its own. A lockfile hash and a package.json hash are hashes of different bytes,
  // so showing them side by side would read as a content difference when the real
  // problem is that the two trees were measured in different ways.
  if (recorded.dependencyClosure.source !== current.dependencyClosure.source) {
    mismatches.push(
      "dependency closure: the bundle's dependencies were read from " +
        `${recorded.dependencyClosure.source}, this project's from ` +
        `${current.dependencyClosure.source} - the two cannot be compared`
    );
  } else if (recorded.dependencyClosure.hash !== current.dependencyClosure.hash) {
    // Name what was ACTUALLY compared. `node_modules` means the installed versions
    // genuinely differ; a lockfile or package.json source means the DECLARED set
    // differs, which is a weaker statement - claiming more than that would be a
    // refusal message that lies about its own evidence.
    const what =
      current.dependencyClosure.source === 'node_modules'
        ? 'the installed dependency versions differ'
        : `the dependencies declared in ${current.dependencyClosure.source} differ`;

    mismatches.push(
      `dependencies: ${what} from the ones the bundle was built against ` +
        `(this project hashes to ${short(current.dependencyClosure.hash)}, ` +
        `the bundle recorded ${short(recorded.dependencyClosure.hash)})`
    );
  }

  return mismatches;
}

/** Render a value for a refusal, hashing digests down to something readable. */
function describe(value: string | null, key: keyof PersistedProjectIdentity): string {
  if (value === null) return 'none';
  return key === 'babelConfigDigest' ? short(value) : value;
}

function short(hash: string): string {
  return hash.slice(0, 12);
}

/**
 * Walk a supplied assets directory.
 *
 * Deliberately the same walk shape the bundling road uses on Metro's
 * `--assets-dest` output - sorted relative paths - because the inventory it
 * produces is compared against the one recorded at emit time.
 */
function collectAssetInventory(assetsDest: string): string[] {
  const results: string[] = [];

  function walk(dir: string, relativePath: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else {
        results.push(relPath);
      }
    }
  }

  walk(assetsDest, '');
  return results.sort();
}

export { collectAssetInventory };
