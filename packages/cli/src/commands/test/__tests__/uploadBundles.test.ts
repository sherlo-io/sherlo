/**
 * Tests for the staged upload step both roads of `sherlo test` share.
 *
 * Covers:
 *  - uploadBundles: one slot request for every tested platform, one upload per
 *    platform with its own slots, and a typed refusal when a platform got no slot.
 *  - applyBundleToPlatformConfig: the ONE place that writes the bundle fields the
 *    runner reads; it never touches `s3Key` (each road's own statement).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uploadStagedArtifacts: vi.fn(),
  handleClientError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../../../helpers', () => ({
  handleClientError: mocks.handleClientError,
  reporting: { addBreadcrumb: vi.fn() },
}));

vi.mock('../uploadStagedArtifacts', () => ({ default: mocks.uploadStagedArtifacts }));

import {
  applyBundleToPlatformConfig,
  realBundleUploadEffects,
  StagedSlotMissingError,
  uploadBundles,
} from '../uploadBundles';

function bundleResult(bundleSizeMb: number): any {
  return {
    bundlePath: '/proj/.sherlo/bundled/bundle.js',
    bundleFormat: 'plain-js',
    bundleSizeMb,
    bundleHash: 'hash',
    assetInventory: [],
    bundler: 'expo',
  };
}

const ANDROID_URLS = {
  jsBundle: { url: 'http://s3/android-js', s3Key: 'android-js-key' },
  assets: { url: 'http://s3/android-assets', s3Key: 'android-assets-key' },
};
const IOS_URLS = {
  jsBundle: { url: 'http://s3/ios-js', s3Key: 'ios-js-key' },
  assets: { url: 'http://s3/ios-assets', s3Key: 'ios-assets-key' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('uploadBundles', () => {
  it('requests slots for every tested platform and uploads each bundle into its own', async () => {
    const requestUploadSlots = vi.fn().mockResolvedValue({
      stagedPresignedUploadUrls: { android: ANDROID_URLS, ios: IOS_URLS },
    });
    const uploadBundle = vi.fn(async ({ platform }: { platform: string }) => ({
      jsBundleS3Key: `${platform}-js-key`,
    }));
    const bundles = { android: bundleResult(1.5), ios: bundleResult(2.5) };

    const keys = await uploadBundles({
      platformsToTest: ['android', 'ios'],
      bundles,
      projectIndex: 7,
      teamId: 'team1234',
      effects: { requestUploadSlots, uploadBundle },
    });

    expect(requestUploadSlots).toHaveBeenCalledWith({
      platforms: ['android', 'ios'],
      projectIndex: 7,
      teamId: 'team1234',
    });
    expect(uploadBundle).toHaveBeenCalledWith({
      platform: 'android',
      bundleResult: bundles.android,
      urls: ANDROID_URLS,
    });
    expect(uploadBundle).toHaveBeenCalledWith({
      platform: 'ios',
      bundleResult: bundles.ios,
      urls: IOS_URLS,
    });
    expect(keys).toEqual({
      android: { jsBundleS3Key: 'android-js-key' },
      ios: { jsBundleS3Key: 'ios-js-key' },
    });
  });

  it('throws StagedSlotMissingError, uploading nothing for it, when a platform got no slot', async () => {
    const requestUploadSlots = vi.fn().mockResolvedValue({
      stagedPresignedUploadUrls: { android: ANDROID_URLS },
    });
    const uploadBundle = vi.fn().mockResolvedValue({ jsBundleS3Key: 'android-js-key' });

    await expect(
      uploadBundles({
        platformsToTest: ['android', 'ios'],
        bundles: { android: bundleResult(1), ios: bundleResult(1) },
        projectIndex: 7,
        teamId: 'team1234',
        effects: { requestUploadSlots, uploadBundle },
      })
    ).rejects.toBeInstanceOf(StagedSlotMissingError);

    expect(uploadBundle).toHaveBeenCalledTimes(1);
    expect(uploadBundle.mock.calls[0][0].platform).toBe('android');
  });

  it('realBundleUploadEffects uploads through uploadStagedArtifacts and asks the client for slots', async () => {
    const client = { getStagedUploadUrls: vi.fn().mockResolvedValue({ stagedPresignedUploadUrls: {} }) };

    const effects = realBundleUploadEffects(client as any);
    await effects.requestUploadSlots({ platforms: ['ios'], projectIndex: 1, teamId: 't' });

    expect(client.getStagedUploadUrls).toHaveBeenCalledWith({
      platforms: ['ios'],
      projectIndex: 1,
      teamId: 't',
    });
    expect(effects.uploadBundle).toBe(mocks.uploadStagedArtifacts);
  });
});

describe('applyBundleToPlatformConfig', () => {
  it('writes every field the runner reads, and the optional keys only when uploaded', () => {
    const platformConfig: Record<string, unknown> = { devices: [], s3Key: 'binary-key' };

    applyBundleToPlatformConfig({
      platformConfig,
      keys: { jsBundleS3Key: 'js-key', assetsS3Key: 'assets-key', manifestS3Key: 'manifest-key' },
      bundleSizeMb: 4.29,
    });

    expect(platformConfig).toEqual({
      devices: [],
      s3Key: 'binary-key',
      jsBundleS3Key: 'js-key',
      bundleSizeMb: 4.29,
      assetsS3Key: 'assets-key',
      manifestS3Key: 'manifest-key',
    });
  });

  it('sends nothing extra for artifacts that were not uploaded', () => {
    const platformConfig: Record<string, unknown> = { devices: [], s3Key: 'binary-key' };

    applyBundleToPlatformConfig({
      platformConfig,
      keys: { jsBundleS3Key: 'js-key' },
      bundleSizeMb: 1,
    });

    expect('assetsS3Key' in platformConfig).toBe(false);
    expect('manifestS3Key' in platformConfig).toBe(false);
    // The binary the bundle is spliced into stays whatever the road said.
    expect(platformConfig.s3Key).toBe('binary-key');
  });
});
