/**
 * Tests for the standard road's fresh bundle.
 *
 * The bundling loop, the supplied-bundle checks and the upload step are the
 * staged road's own code and have their own suites; what is under test here is
 * that the standard road runs THOSE - never a second implementation - and hands
 * back what the build config needs. Nothing here is fail-soft: a refusal from
 * any of them ends the run.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildBundles: vi.fn(),
  resolveSuppliedBundles: vi.fn(),
  uploadBundles: vi.fn(),
  realBundleUploadEffects: vi.fn(),
  buildBundleForPlatform: vi.fn(),
}));

vi.mock('../../commands/test/bundleAndPreview', () => ({
  buildBundles: mocks.buildBundles,
  REAL_BUNDLING_EFFECTS: { bundleFor: mocks.buildBundleForPlatform, gateMetadataFor: vi.fn() },
}));
vi.mock('../../commands/test/suppliedBundle', () => ({
  resolveSuppliedBundles: mocks.resolveSuppliedBundles,
}));
vi.mock('../../commands/test/uploadBundles', () => ({
  uploadBundles: mocks.uploadBundles,
  realBundleUploadEffects: mocks.realBundleUploadEffects,
}));

import { realFreshBundleEffects, uploadFreshBundles } from '../uploadFreshBundles';

function bundleResult(bundleSizeMb: number): any {
  return { bundlePath: `/proj/bundle-${bundleSizeMb}.js`, bundleSizeMb };
}

const EFFECTS = {
  bundling: { bundleFor: vi.fn(), gateMetadataFor: vi.fn() },
  upload: { requestUploadSlots: vi.fn(), uploadBundle: vi.fn() },
};

const BUNDLES = { android: bundleResult(1.5), ios: bundleResult(2.5) };
const KEYS = {
  android: { jsBundleS3Key: 'android-js-key', assetsS3Key: 'android-assets-key' },
  ios: { jsBundleS3Key: 'ios-js-key' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mocks.buildBundles.mockResolvedValue({ results: BUNDLES, gateMetadata: {} });
  mocks.resolveSuppliedBundles.mockResolvedValue({ results: BUNDLES, gateMetadata: {} });
  mocks.uploadBundles.mockResolvedValue(KEYS);
});

describe('uploadFreshBundles - built', () => {
  it('bundles through the staged bundling loop, uploads through the staged upload step, and returns keys + size per platform', async () => {
    const uploaded = await uploadFreshBundles({
      projectRoot: '/proj',
      platforms: ['android', 'ios'],
      baseFingerprint: 'base-fp',
      projectIndex: 7,
      teamId: 'team1234',
      effects: EFFECTS,
    });

    expect(mocks.buildBundles).toHaveBeenCalledWith({
      projectRoot: '/proj',
      platformsToTest: ['android', 'ios'],
      effects: EFFECTS.bundling,
    });
    expect(mocks.resolveSuppliedBundles).not.toHaveBeenCalled();
    expect(mocks.uploadBundles).toHaveBeenCalledWith({
      platformsToTest: ['android', 'ios'],
      bundles: BUNDLES,
      projectIndex: 7,
      teamId: 'team1234',
      effects: EFFECTS.upload,
    });
    expect(uploaded).toEqual({
      android: { keys: KEYS.android, bundleSizeMb: 1.5 },
      ios: { keys: KEYS.ios, bundleSizeMb: 2.5 },
    });
  });

  it('lets an upload failure end the run (nothing is fail-soft here)', async () => {
    mocks.uploadBundles.mockRejectedValue(new Error('Staged upload slot missing for ios.'));

    await expect(
      uploadFreshBundles({
        projectRoot: '/proj',
        platforms: ['ios'],
        baseFingerprint: 'base-fp',
        projectIndex: 7,
        teamId: 'team1234',
        effects: EFFECTS,
      })
    ).rejects.toThrow('Staged upload slot missing for ios.');
  });
});

describe('uploadFreshBundles - supplied (--bundle-dir)', () => {
  it('resolves the supplied directory through the staged road checks instead of bundling', async () => {
    const uploaded = await uploadFreshBundles({
      projectRoot: '/proj',
      platforms: ['android'],
      bundleDir: '/tmp/bundles',
      baseFingerprint: 'base-fp',
      projectIndex: 7,
      teamId: 'team1234',
      effects: EFFECTS,
    });

    expect(mocks.resolveSuppliedBundles).toHaveBeenCalledWith({
      bundleDir: '/tmp/bundles',
      projectRoot: '/proj',
      platformsToTest: ['android'],
      // The advisory pairing note compares against the base this run registers.
      nativeFingerprint: 'base-fp',
      gateMetadataFor: EFFECTS.bundling.gateMetadataFor,
    });
    expect(mocks.buildBundles).not.toHaveBeenCalled();
    expect(uploaded).toEqual({ android: { keys: KEYS.android, bundleSizeMb: 1.5 } });
  });

  it('propagates a supplied-bundle refusal (a stale directory) and uploads nothing', async () => {
    // The staleness check itself lives in resolveSuppliedBundle and has its own
    // suite; what matters here is that its refusal is the run's refusal.
    mocks.resolveSuppliedBundles.mockRejectedValue(
      new Error("app source: this project's source has changed since the bundle was built")
    );

    await expect(
      uploadFreshBundles({
        projectRoot: '/proj',
        platforms: ['android'],
        bundleDir: '/tmp/bundles',
        baseFingerprint: 'base-fp',
        projectIndex: 7,
        teamId: 'team1234',
        effects: EFFECTS,
      })
    ).rejects.toThrow('source has changed since the bundle was built');

    expect(mocks.uploadBundles).not.toHaveBeenCalled();
  });
});

describe('realFreshBundleEffects', () => {
  it('bundles with the staged bundler, derives no bundle-side gate metadata, and uploads through the client', async () => {
    const client = { getStagedUploadUrls: vi.fn() };
    const uploadEffects = { requestUploadSlots: vi.fn(), uploadBundle: vi.fn() };
    mocks.realBundleUploadEffects.mockReturnValue(uploadEffects);

    const effects = realFreshBundleEffects(client as any);

    expect(effects.bundling.bundleFor).toBe(mocks.buildBundleForPlatform);
    // The binary's own gate metadata is what gets registered; the bundle probe
    // the shared loops build alongside is declared absent, not fabricated.
    await expect(effects.bundling.gateMetadataFor('/proj', 'ios', {} as any)).resolves.toEqual({
      derivedFrom: 'none',
    });
    expect(mocks.realBundleUploadEffects).toHaveBeenCalledWith(client);
    expect(effects.upload).toBe(uploadEffects);
  });
});
