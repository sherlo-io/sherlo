/**
 * THE STAGED UPLOAD STEP, shared by both roads of `sherlo test`.
 *
 * A run's JS bundle reaches the runner through the staged S3 slots
 * (getStagedUploadUrls - never getBuildUploadUrls, which hands out slots for
 * native binaries), and the runner learns where it landed from a handful of
 * fields on the platform's build config. Both roads bundle the same way, upload
 * the same way and describe the upload the same way, so those two steps live
 * here ONCE:
 *
 *   - {@link uploadBundles}: request one staged slot set per platform and PUT
 *     each platform's bundle (+ assets, + module manifest) into it.
 *   - {@link applyBundleToPlatformConfig}: write the resulting keys onto the
 *     platform config, so the runner splices THIS bundle into the binary before
 *     it installs the app.
 *
 * What differs between the roads is the BINARY the bundle is spliced into, and
 * that is said by `s3Key`, which stays each road's own business: the staged road
 * sends the async-upload placeholder (it uploaded no binary - the runner takes
 * the registered base), the standard road sends the key its own binary was just
 * uploaded under. Neither is decided here.
 */
import { Platform, StagedPlatformUploadUrls } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import chalk from 'chalk';
import { handleClientError, reporting } from '../../helpers';
import type { BundleResult } from './buildBundle';
import uploadStagedArtifacts, { type StagedUploadKeys } from './uploadStagedArtifacts';

/**
 * The two effects the upload step performs, as parameters so an expectation
 * producer runs THIS step over scripted slots rather than a re-implementation.
 */
export type BundleUploadEffects = {
  requestUploadSlots: (params: {
    platforms: Platform[];
    projectIndex: number;
    teamId: string;
  }) => Promise<{
    stagedPresignedUploadUrls: Partial<Record<Platform, StagedPlatformUploadUrls>>;
  }>;
  uploadBundle: (params: {
    platform: Platform;
    bundleResult: BundleResult;
    urls: StagedPlatformUploadUrls;
  }) => Promise<StagedUploadKeys>;
};

export function realBundleUploadEffects(client: ReturnType<typeof sdkClient>): BundleUploadEffects {
  return {
    requestUploadSlots: (params) => client.getStagedUploadUrls(params).catch(handleClientError),
    uploadBundle: uploadStagedArtifacts,
  };
}

/**
 * The server answered the slot request without a slot for a platform that has
 * a bundle. A bundle with nowhere to go is a run that cannot render it; each
 * road decides what that means for the run, so the case is its own class.
 */
export class StagedSlotMissingError extends Error {
  constructor(platform: Platform) {
    super(`Staged upload slot missing for ${platform}.`);
    this.name = 'StagedSlotMissingError';
  }
}

/**
 * Upload every tested platform's bundle to freshly requested staged slots and
 * return the S3 keys each landed under.
 */
export async function uploadBundles({
  platformsToTest,
  bundles,
  projectIndex,
  teamId,
  effects,
}: {
  platformsToTest: Platform[];
  bundles: Partial<Record<Platform, BundleResult>>;
  projectIndex: number;
  teamId: string;
  effects: BundleUploadEffects;
}): Promise<Partial<Record<Platform, StagedUploadKeys>>> {
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling getStagedUploadUrls API',
    data: { teamId, projectIndex, platforms: platformsToTest },
    level: 'info',
  });

  const { stagedPresignedUploadUrls } = await effects.requestUploadSlots({
    platforms: platformsToTest,
    projectIndex,
    teamId,
  });

  const keys: Partial<Record<Platform, StagedUploadKeys>> = {};

  for (const platform of platformsToTest) {
    const urls = stagedPresignedUploadUrls[platform];
    const bundleResult = bundles[platform];

    if (!urls || !bundleResult) {
      throw new StagedSlotMissingError(platform);
    }

    console.log(chalk.cyan(`\n⬆️  Uploading ${platform} bundle...`));
    keys[platform] = await effects.uploadBundle({ platform, bundleResult, urls });
  }

  return keys;
}

/**
 * The per-platform build config with the `manifestS3Key` the api accepts on
 * openBuild. Optional and local because the published @sherlo/api-types config
 * type this repo typechecks against does not carry it yet; bridged here rather
 * than cast to `any`, the same way `GateMetadataInput` bridges the gate's wire
 * shape. Drop once api-types republishes with the field.
 */
export type PlatformConfigWithManifest = { manifestS3Key?: string };

/** The subset of a platform's build config that describes its JS bundle. */
type PlatformBundleConfig = {
  jsBundleS3Key?: string;
  bundleSizeMb?: number;
  assetsS3Key?: string;
  baseReference?: string;
} & PlatformConfigWithManifest;

/**
 * Put an uploaded bundle on a platform's build config - the ONE place that
 * knows which fields the runner reads to splice a bundle into a binary.
 *
 * The runner treats a platform as bundle-carrying only when `baseReference`,
 * the bundle URL (derived from `jsBundleS3Key`) and a positive `bundleSizeMb`
 * are ALL present, so all three are written unconditionally. `assetsS3Key` and
 * `manifestS3Key` are written only when that artifact was uploaded: an absent
 * key means "nothing extra", never a fabricated one.
 */
export function applyBundleToPlatformConfig({
  platformConfig,
  keys,
  bundleSizeMb,
  baseReference,
}: {
  platformConfig: PlatformBundleConfig;
  keys: StagedUploadKeys;
  bundleSizeMb: number;
  /** The base fingerprint this run was computed against. */
  baseReference: string;
}): void {
  platformConfig.jsBundleS3Key = keys.jsBundleS3Key;
  platformConfig.bundleSizeMb = bundleSizeMb;
  platformConfig.baseReference = baseReference;
  if (keys.assetsS3Key) {
    platformConfig.assetsS3Key = keys.assetsS3Key;
  }
  if (keys.manifestS3Key) {
    platformConfig.manifestS3Key = keys.manifestS3Key;
  }
}
