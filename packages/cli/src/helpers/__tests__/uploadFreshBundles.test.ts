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
  gateMetadataFor: vi.fn(),
}));

vi.mock('../../commands/test/bundleAndPreview', () => ({
  buildBundles: mocks.buildBundles,
}));
// The real bundler is reached through the seam now (../../seams/bundler), so that is what this
// file stubs - `realFreshBundleEffects` asks the seam for the bundler IN FORCE rather than
// naming the real one.
vi.mock('../../seams/bundler', () => ({
  bundler: () => ({
    bundleFor: mocks.buildBundleForPlatform,
    gateMetadataFor: mocks.gateMetadataFor,
  }),
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

/** The gate facts a stored platform's fresh bundle carries. */
const STORED_GATE_METADATA = { derivedFrom: 'source', engineClass: 'hermes', bundleFormat: 'hbc' };

/** The config's `build` block, which reaches the bundler as it reaches the app build. */
const BUILD_SETTINGS = { env: { STORYBOOK_ENABLED: 'true' } };
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
  mocks.gateMetadataFor.mockResolvedValue(STORED_GATE_METADATA);
});

describe('uploadFreshBundles - built', () => {
  it('bundles through the staged bundling loop, uploads through the staged upload step, and returns keys + size per platform', async () => {
    const uploaded = await uploadFreshBundles({
      projectRoot: '/proj',
      buildSettings: BUILD_SETTINGS,
      platforms: ['android', 'ios'],
      platformsOnStoredBuild: [],
      baseFingerprints: { android: 'base-fp-android', ios: 'base-fp-ios' },
      projectIndex: 7,
      teamId: 'team1234',
      effects: EFFECTS,
    });

    expect(mocks.buildBundles).toHaveBeenCalledWith({
      projectRoot: '/proj',
      platformsToTest: ['android', 'ios'],
      buildSettings: BUILD_SETTINGS,
      // The bundler handed in, behind a gate that derives no facts for an uploaded platform.
      effects: {
        bundleFor: EFFECTS.bundling.bundleFor,
        gateMetadataFor: expect.any(Function),
      },
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

  it("derives a stored platform's gate facts from its fresh bundle, and none for an uploaded one", async () => {
    // The shared loop asks its effects for each platform's gate facts, as the real one does.
    mocks.buildBundles.mockImplementation(async ({ platformsToTest, effects }) => {
      const gateMetadata: Record<string, unknown> = {};
      for (const platform of platformsToTest) {
        gateMetadata[platform] = await effects.gateMetadataFor(
          '/proj',
          platform,
          BUNDLES[platform as 'ios']
        );
      }
      return { results: BUNDLES, gateMetadata };
    });
    EFFECTS.bundling.gateMetadataFor.mockResolvedValue(STORED_GATE_METADATA);

    const uploaded = await uploadFreshBundles({
      projectRoot: '/proj',
      buildSettings: BUILD_SETTINGS,
      platforms: ['android', 'ios'],
      platformsOnStoredBuild: ['ios'],
      baseFingerprints: { android: 'base-fp-android', ios: 'base-fp-ios' },
      projectIndex: 7,
      teamId: 'team1234',
      effects: EFFECTS,
    });

    // Derived for the stored platform alone: an uploaded one's come out of its binary.
    expect(EFFECTS.bundling.gateMetadataFor).toHaveBeenCalledTimes(1);
    expect(EFFECTS.bundling.gateMetadataFor).toHaveBeenCalledWith('/proj', 'ios', BUNDLES.ios);
    expect(uploaded).toEqual({
      android: { keys: KEYS.android, bundleSizeMb: 1.5 },
      ios: { keys: KEYS.ios, bundleSizeMb: 2.5, storedBuildGateMetadata: STORED_GATE_METADATA },
    });
  });

  it('lets an upload failure end the run (nothing is fail-soft here)', async () => {
    mocks.uploadBundles.mockRejectedValue(new Error('Staged upload slot missing for ios.'));

    await expect(
      uploadFreshBundles({
        projectRoot: '/proj',
        buildSettings: BUILD_SETTINGS,
        platforms: ['ios'],
        platformsOnStoredBuild: [],
        baseFingerprints: { ios: 'base-fp-ios' },
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
      buildSettings: BUILD_SETTINGS,
      platforms: ['android'],
      platformsOnStoredBuild: [],
      bundleDir: '/tmp/bundles',
      baseFingerprints: { android: 'base-fp-android' },
      projectIndex: 7,
      teamId: 'team1234',
      effects: EFFECTS,
    });

    expect(mocks.resolveSuppliedBundles).toHaveBeenCalledWith({
      bundleDir: '/tmp/bundles',
      projectRoot: '/proj',
      platformsToTest: ['android'],
      // The advisory pairing note compares against the base this run registers.
      baseFingerprints: { android: 'base-fp-android' },
      gateMetadataFor: expect.any(Function),
    });
    // The metadata the sidecar recorded is ignored for an uploaded platform: this road registers
    // what it reads out of the binary, and derives nothing from the bundle.
    const { gateMetadataFor } = mocks.resolveSuppliedBundles.mock.calls[0][0];
    await expect(
      gateMetadataFor('android', BUNDLES.android, { derivedFrom: 'source' })
    ).resolves.toEqual({ derivedFrom: 'none' });
    expect(EFFECTS.bundling.gateMetadataFor).not.toHaveBeenCalled();
    expect(mocks.buildBundles).not.toHaveBeenCalled();
    expect(uploaded).toEqual({ android: { keys: KEYS.android, bundleSizeMb: 1.5 } });
  });

  it("sends a stored platform's gate facts as the sidecar recorded them, as the staged road does", async () => {
    mocks.resolveSuppliedBundles.mockImplementation(
      async ({ platformsToTest, gateMetadataFor }) => {
        const gateMetadata: Record<string, unknown> = {};
        for (const platform of platformsToTest) {
          gateMetadata[platform] = await gateMetadataFor(
            platform,
            BUNDLES[platform as 'ios'],
            STORED_GATE_METADATA
          );
        }
        return { results: BUNDLES, gateMetadata };
      }
    );

    const uploaded = await uploadFreshBundles({
      projectRoot: '/proj',
      buildSettings: BUILD_SETTINGS,
      platforms: ['android', 'ios'],
      platformsOnStoredBuild: ['ios'],
      bundleDir: '/tmp/bundles',
      baseFingerprints: { android: 'base-fp-android', ios: 'base-fp-ios' },
      projectIndex: 7,
      teamId: 'team1234',
      effects: EFFECTS,
    });

    expect(uploaded).toEqual({
      android: { keys: KEYS.android, bundleSizeMb: 1.5 },
      ios: { keys: KEYS.ios, bundleSizeMb: 2.5, storedBuildGateMetadata: STORED_GATE_METADATA },
    });
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
        buildSettings: BUILD_SETTINGS,
        platforms: ['android'],
        platformsOnStoredBuild: [],
        bundleDir: '/tmp/bundles',
        baseFingerprints: { android: 'base-fp-android' },
        projectIndex: 7,
        teamId: 'team1234',
        effects: EFFECTS,
      })
    ).rejects.toThrow('source has changed since the bundle was built');

    expect(mocks.uploadBundles).not.toHaveBeenCalled();
  });
});

describe('the real fresh-bundle effects bundle through the seam and upload through the client', () => {
  it('asks the seam for the bundler in force, for the bundle and its gate metadata, and hands the upload the client', async () => {
    const client = { getStagedUploadUrls: vi.fn() };
    const uploadEffects = { requestUploadSlots: vi.fn(), uploadBundle: vi.fn() };
    mocks.realBundleUploadEffects.mockReturnValue(uploadEffects);

    const effects = realFreshBundleEffects(client as any);

    // Bundling goes to the bundler IN FORCE (../../seams/bundler), asked for at call time - so
    // this is proved by CALLING it, not by comparing function identities: a posed run installs
    // its own bundler, and a road that had captured the real one at module load would bundle for
    // real inside a pose.
    await effects.bundling.bundleFor('/proj', 'ios', BUILD_SETTINGS);
    expect(mocks.buildBundleForPlatform).toHaveBeenCalledWith('/proj', 'ios', BUILD_SETTINGS);
    // A stored platform's gate facts are derived from its bundle by the bundler in force, as on
    // the staged road (uploadFreshBundles asks only for a stored platform's).
    const bundled = { bundlePath: '/proj/ios.js' } as any;
    await expect(effects.bundling.gateMetadataFor('/proj', 'ios', bundled)).resolves.toEqual(
      STORED_GATE_METADATA
    );
    expect(mocks.gateMetadataFor).toHaveBeenCalledWith('/proj', 'ios', bundled);
    expect(mocks.realBundleUploadEffects).toHaveBeenCalledWith(client);
    expect(effects.upload).toBe(uploadEffects);
  });
});
