/**
 * THE PRODUCER - `sherlo test --emit-bundle-dir <dir>`.
 *
 * The exact inverse of `--bundle-dir`. It runs the normal bundling loop, then
 * writes the triple plus its sidecar into a directory that `--bundle-dir` will
 * accept, and exits without uploading, opening a build, or making a network call.
 *
 * ONE WRITER, ONE READER. This is the only thing that ever writes a sidecar, and
 * ./suppliedBundle is the only thing that reads one - both over the single schema
 * in ./bundleSidecar. Nobody hand-assembles a bundle directory: if a caller finds
 * themselves writing that JSON, the flag has failed them. That symmetry is what
 * makes the round trip provable, and an emit-then-accept test pins it.
 *
 * THIS MACHINE HAS THE INSTALL; THE ACCEPTING ONE DOES NOT. Everything the
 * accepting run would otherwise need node_modules for is derived HERE and
 * recorded: the source-derived gate metadata and the base fingerprint. The
 * acceptor verifies the tree they were derived from (see ./bundleSidecar and
 * ./recordedBaseFingerprint) and uses the recorded values.
 */
import fs from 'fs';
import path from 'path';
import { Platform } from '@sherlo/api-types';
import { emit } from '../../helpers/transcriptSink';
import type { BaseFingerprintResult, GateMetadataInput } from '../../helpers/fingerprint';
import { FALLBACK_LINE as SHARED_FALLBACK_LINE } from './stagedGateRefusal';
import { buildBundleForPlatform, buildGateMetadata, type BundleResult } from './buildBundle';
import {
  SIDECAR_VERSION,
  assetsDirName,
  bundleFileName,
  computeAppSourceClosure,
  moduleManifestAppSourceInputs,
  moduleManifestFileName,
  readCliVersion,
  readProjectIdentity,
  sha256OfBuffer,
  sidecarFileName,
  type BundleSidecar,
} from './bundleSidecar';
import { recordBaseFingerprint } from './recordedBaseFingerprint';

const FALLBACK_LINE = `\n${SHARED_FALLBACK_LINE}`;

/**
 * Build each platform's bundle and write it, its assets, its module manifest and
 * its sidecar into `bundleDir`.
 *
 * `bundleFor` and `gateMetadataFor` are parameters for the same reason the
 * bundling loop's are: a test can supply a scripted {@link BundleResult} and
 * exercise this writer without running a real bundler.
 */
export async function emitBundleDir({
  projectRoot,
  platformsToTest,
  bundleDir,
  baseFingerprint,
  bundleFor = (root, platform) => buildBundleForPlatform({ projectRoot: root, platform }),
  gateMetadataFor = (root, platform, bundleResult) =>
    buildGateMetadata({ projectRoot: root, platform, bundleResult }),
}: {
  projectRoot: string;
  platformsToTest: Platform[];
  bundleDir: string;
  /** The base fingerprint this machine computed for the tree, when it could. */
  baseFingerprint?: BaseFingerprintResult;
  bundleFor?: (projectRoot: string, platform: Platform) => Promise<BundleResult>;
  gateMetadataFor?: (
    projectRoot: string,
    platform: Platform,
    bundleResult: BundleResult
  ) => Promise<GateMetadataInput>;
}): Promise<void> {
  fs.mkdirSync(bundleDir, { recursive: true });

  emit({ kind: 'bundle-emit-header', bundleDir });

  for (const platform of platformsToTest) {
    emit({ kind: 'platform-bundle-start', platform });

    const result = await bundleFor(projectRoot, platform);

    // A triple without its manifest is not a triple. The built road may bail open
    // on a missing manifest because failing there would break a build that would
    // otherwise have worked; emitting is different - the whole point of the output
    // is to be accepted later, and a directory that can only ever be refused is
    // worse than no directory at all. Refuse now, while the cause is still on
    // screen, rather than in someone else's CI job next week.
    if (!result.moduleManifest) {
      throw new Error(
        `No module manifest was produced for the ${platform} bundle.\n\n` +
          'A supplied bundle must carry its module manifest - without one, every ' +
          'run that used this directory would silently capture every story instead ' +
          'of only what changed.\n\n' +
          'The manifest is emitted by the Sherlo Metro serializer. Check that ' +
          "@sherlo/react-native-storybook's Metro config is applied in this project." +
          FALLBACK_LINE
      );
    }

    // The bundle.
    const bundleTarget = path.join(bundleDir, bundleFileName(platform));
    fs.copyFileSync(result.bundlePath, bundleTarget);
    const bundleBuffer = fs.readFileSync(bundleTarget);

    // The assets, when the app has any.
    const assetsTarget = path.join(bundleDir, assetsDirName(platform));
    fs.rmSync(assetsTarget, { recursive: true, force: true });
    if (result.assetsDest) {
      fs.cpSync(result.assetsDest, assetsTarget, { recursive: true });
    }

    // The module manifest - the serializer's exact bytes, never re-serialized.
    // Re-encoding would risk drifting from the byte-canonical form the serializer
    // produced, and the manifest is compared byte-wise downstream.
    const manifestTarget = path.join(bundleDir, moduleManifestFileName(platform));
    fs.writeFileSync(manifestTarget, result.moduleManifest.raw);

    // The closures carry their pre-image (which packages, which files) and the
    // sidecar writes it down, so a refusal can name what moved.
    const identity = readProjectIdentity(projectRoot);
    const appSource = computeAppSourceClosure({
      projectRoot,
      ...moduleManifestAppSourceInputs(result.moduleManifest),
    });

    const sidecar: BundleSidecar = {
      sidecarVersion: SIDECAR_VERSION,
      platform,
      bundle: {
        file: bundleFileName(platform),
        sha256: sha256OfBuffer(bundleBuffer),
        sizeBytes: bundleBuffer.length,
        format: result.bundleFormat,
        bundler: result.bundler,
        // The Sherlo-generated entry buildBundleForPlatform actually pointed
        // the bundler at, not a fresh detectEntryFile(projectRoot) - the two
        // must record the SAME value, and re-deriving here would silently
        // drop the seam requires from the recorded entry.
        entryFile: result.entryFile,
      },
      assets: {
        dir: result.assetsDest ? assetsDirName(platform) : null,
        inventory: result.assetInventory,
      },
      moduleManifest: {
        file: moduleManifestFileName(platform),
        sha256: sha256OfBuffer(result.moduleManifest.raw),
      },
      project: identity,
      appSource,
      gateMetadata: await gateMetadataFor(projectRoot, platform, result),
      baseFingerprint: baseFingerprint ? recordBaseFingerprint(baseFingerprint, projectRoot) : null,
      createdAt: new Date().toISOString(),
      createdBy: { cliVersion: readCliVersion() },
    };

    fs.writeFileSync(
      path.join(bundleDir, sidecarFileName(platform)),
      `${JSON.stringify(sidecar, null, 2)}\n`
    );

    emit({
      kind: 'platform-bundle-emitted',
      platform,
      bundleDir,
      assetCount: result.assetInventory.length,
    });
  }
}

export default emitBundleDir;
