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
 */
import fs from 'fs';
import path from 'path';
import { Platform } from '@sherlo/api-types';
import { emit } from '../../helpers/transcriptSink';
import { detectEntryFile } from '../../commands/showError/detectBundler';
import { FALLBACK_LINE as SHARED_FALLBACK_LINE } from './stagedGateRefusal';
import { buildBundleForPlatform, type BundleResult } from './buildBundle';
import {
  SIDECAR_VERSION,
  assetsDirName,
  bundleFileName,
  computeAppSourceClosure,
  moduleManifestSourcePaths,
  moduleManifestFileName,
  readCliVersion,
  readProjectIdentity,
  sha256OfBuffer,
  sidecarFileName,
  type BundleSidecar,
} from './bundleSidecar';

const FALLBACK_LINE = `\n${SHARED_FALLBACK_LINE}`;

/**
 * Build each platform's bundle and write it, its assets, its module manifest and
 * its sidecar into `bundleDir`.
 *
 * `bundleFor` is a parameter for the same reason the bundling loop's is: a test
 * can supply a scripted {@link BundleResult} and exercise this writer without
 * running a real bundler.
 */
export async function emitBundleDir({
  projectRoot,
  platformsToTest,
  bundleDir,
  nativeFingerprint,
  bundleFor = (root, platform) => buildBundleForPlatform({ projectRoot: root, platform }),
}: {
  projectRoot: string;
  platformsToTest: Platform[];
  bundleDir: string;
  nativeFingerprint?: string;
  bundleFor?: (projectRoot: string, platform: Platform) => Promise<BundleResult>;
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

    const sidecar: BundleSidecar = {
      sidecarVersion: SIDECAR_VERSION,
      platform,
      bundle: {
        file: bundleFileName(platform),
        sha256: sha256OfBuffer(bundleBuffer),
        sizeBytes: bundleBuffer.length,
        format: result.bundleFormat,
        bundler: result.bundler,
        entryFile: detectEntryFile(projectRoot),
      },
      assets: {
        dir: result.assetsDest ? assetsDirName(platform) : null,
        inventory: result.assetInventory,
      },
      moduleManifest: {
        file: moduleManifestFileName(platform),
        sha256: sha256OfBuffer(result.moduleManifest.raw),
      },
      project: await readProjectIdentity({ projectRoot, platform }),
      appSource: computeAppSourceClosure({
        projectRoot,
        modulePaths: moduleManifestSourcePaths(result.moduleManifest),
      }),
      nativeFingerprint: nativeFingerprint ?? null,
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
