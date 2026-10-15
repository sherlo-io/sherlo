/**
 * Contract pin for the asyncUpload payload assembled by
 * asyncUploadBuildAndRunTests (the EAS-cloud sender).
 *
 * SHERLO-1920 made Diff Scope a server-side concern and removed the client's
 * `changedFiles` computation from BOTH senders. This test exists to hold that
 * removal in place at the EAS sender: the client MUST NOT send `changedFiles`
 * on the asyncUpload payload. This is a deliberate client-side contract, not an
 * incidental omission - the wire schema still ACCEPTS `changedFiles` so older
 * published CLIs keep working, which means nothing but this explicit negative
 * stops the field from silently returning via a bad merge or a restored helper.
 * Do not delete it as redundant.
 *
 * (The openBuild sender is pinned the same way in
 * helpers/__tests__/openBuildPayload.contract.test.ts.)
 */
import zlib from 'zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const asyncUploadSpy = vi.fn().mockResolvedValue({ couldRunThisBuildRightNow: false });
  const getStagedUploadUrlsSpy = vi.fn().mockResolvedValue({
    stagedPresignedUploadUrls: {
      android: {
        jsBundle: { url: 'https://s3/bundle', s3Key: 'staged/bundle' },
        assets: { url: 'https://s3/assets', s3Key: 'staged/assets' },
        manifest: { url: 'https://s3/manifest', s3Key: 'staged/android-module-map.json.gz' },
      },
    },
  });
  return {
    asyncUploadSpy,
    getStagedUploadUrlsSpy,
    sdkClient: vi.fn().mockReturnValue({
      asyncUpload: asyncUploadSpy,
      getStagedUploadUrls: getStagedUploadUrlsSpy,
    }),
    readValidatedModuleManifest: vi.fn().mockReturnValue(null),
    putBuffer: vi.fn().mockResolvedValue(undefined),
    getTokenParts: vi
      .fn()
      .mockReturnValue({ apiToken: 'tok123', projectIndex: 1, teamId: 'team1' }),
    getValidatedBinariesInfoAndNextBuildIndex: vi.fn().mockResolvedValue({
      binariesInfo: {
        android: { s3Key: 'android.s3key', fileName: 'app.apk', hash: 'abc123' },
        ios: undefined,
        sdkVersion: '1.0.0',
      },
    }),
    handleClientError: vi.fn(),
    logWarning: vi.fn(),
    uploadOrPrintBinaryReuse: vi.fn().mockResolvedValue(undefined),
    reporting: { addBreadcrumb: vi.fn() },
    getAppBuildUrl: vi.fn().mockReturnValue('https://app.sherlo.io/test/1'),
    computeBaseFingerprint: vi.fn().mockResolvedValue({
      android: { hash: null, nativeFingerprint: 'fp-abc' },
      ios: { hash: null, nativeFingerprint: 'fp-abc' },
    }),
    registerBase: vi.fn().mockResolvedValue({ registered: false }),
    getBuildPath: vi.fn().mockReturnValue('/tmp/app.apk'),
  };
});

vi.mock('@sherlo/sdk-client', () => ({ default: mocks.sdkClient }));

vi.mock('../../../../../helpers', () => ({
  getAppBuildUrl: mocks.getAppBuildUrl,
  getCwd: () => '/tmp/project',
  getTokenParts: mocks.getTokenParts,
  getValidatedBinariesInfoAndNextBuildIndex: mocks.getValidatedBinariesInfoAndNextBuildIndex,
  handleClientError: mocks.handleClientError,
  logWarning: mocks.logWarning,
  uploadOrPrintBinaryReuse: mocks.uploadOrPrintBinaryReuse,
  reporting: mocks.reporting,
}));

vi.mock('../getBuildPath', () => ({ default: mocks.getBuildPath }));

// The module map the EAS build wrote, and the staged upload every road puts it through.
vi.mock('../../../../test/readModuleManifest', async (importActual) => ({
  // The story count is the real one, read off whatever module map the case hands back.
  countBundleStories: (await importActual<typeof import('../../../../test/readModuleManifest')>())
    .countBundleStories,
  readValidatedModuleManifest: mocks.readValidatedModuleManifest,
}));
vi.mock('../../../../test/uploadStagedArtifacts', () => ({ putBuffer: mocks.putBuffer }));

vi.mock('../../../../../helpers/fingerprint', () => ({
  computeBaseFingerprint: mocks.computeBaseFingerprint,
  registerBase: mocks.registerBase,
}));

import { installServerCalls, liveServerCalls } from '../../../../../seams/serverCalls';
import asyncUploadBuildAndRunTests from '../asyncUploadBuildAndRunTests';

// The hook spends the run's one-build ticket, with the team and project the hand-over file names.
const BASE_ARGS = {
  buildIndex: 1,
  easBuildProfile: 'preview',
  ticket: 'sbt_theticketofrun1',
  teamId: 'team1',
  projectIndex: 1,
};

describe('asyncUploadBuildAndRunTests - asyncUpload payload contract', () => {
  beforeEach(() => {
    process.env.EAS_BUILD_PLATFORM = 'android';
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Most EAS builds write no module map: the bundler writes one only when asked to.
    mocks.readValidatedModuleManifest.mockReturnValue(null);
  });

  afterEach(() => {
    delete process.env.EAS_BUILD_PLATFORM;
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('never sends changedFiles on the asyncUpload payload', async () => {
    await asyncUploadBuildAndRunTests(BASE_ARGS);

    expect(mocks.asyncUploadSpy).toHaveBeenCalledTimes(1);
    const payload = mocks.asyncUploadSpy.mock.calls[0][0];
    expect(payload).not.toHaveProperty('changedFiles');
  });

  it("sends the app build's file name as binaryFileName", async () => {
    await asyncUploadBuildAndRunTests(BASE_ARGS);

    const payload = mocks.asyncUploadSpy.mock.calls[0][0];
    expect(payload.binaryFileName).toBe('app.apk');
    expect(payload).not.toHaveProperty('fileName');
  });

  it('uploads the module map the EAS build wrote, so the run captures only what changed', async () => {
    const moduleMapBytes = Buffer.from(
      '{"version":1,"header":{},"moduleHashes":{},"storyClosures":{}}'
    );
    mocks.readValidatedModuleManifest.mockReturnValue({
      raw: moduleMapBytes,
      parsed: { storyClosures: { 'A.stories.tsx': [], 'B.stories.tsx': [] } },
    });
    const sentToTheSeam: Array<Record<string, any>> = [];
    const uninstall = installServerCalls({
      ...liveServerCalls,
      asyncUpload: (request) => {
        sentToTheSeam.push(request);
        return liveServerCalls.asyncUpload(request);
      },
    });

    await asyncUploadBuildAndRunTests(BASE_ARGS).finally(uninstall);

    // Read from the project the hook runs in, staged in the slot the service offered, gzipped.
    expect(mocks.readValidatedModuleManifest).toHaveBeenCalledWith('/tmp/project');
    expect(mocks.getStagedUploadUrlsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ platforms: ['android'], projectIndex: 1, teamId: 'team1' })
    );
    const upload = mocks.putBuffer.mock.calls[0][0];
    expect(upload.uploadUrl).toBe('https://s3/manifest');
    expect(zlib.gunzipSync(upload.buffer)).toEqual(moduleMapBytes);

    // And named on the delivery, so the run's Diff Scope reads it.
    const payload = mocks.asyncUploadSpy.mock.calls[0][0];
    expect(payload.manifestS3Key).toBe('staged/android-module-map.json.gz');

    // The delivery also says how the app build was made and how many stories its bundle holds.
    // The live seam holds it back from the client until the service takes it, so it is read where
    // the hook hands it to the seam.
    expect(sentToTheSeam[0].pushFacts).toEqual({ madeBy: 'eas', storiesInBundle: 2 });
  });

  it('the EAS hook stores the fingerprint the push took before the build', async () => {
    // On Expo's machine prebuild and the build have written into the project, so a fingerprint
    // taken there is not the one the next push computes on a clean tree.
    const takenOnExpo = {
      hash: 'taken-after-the-build',
      nativeFingerprint: 'native-after-the-build',
    };
    mocks.computeBaseFingerprint.mockResolvedValueOnce({ android: takenOnExpo, ios: takenOnExpo });
    const pushFingerprint = {
      hash: 'taken-by-the-push',
      nativeFingerprint: 'native-taken-by-the-push',
    };

    await asyncUploadBuildAndRunTests({ ...BASE_ARGS, fingerprints: { android: pushFingerprint } });

    expect(mocks.computeBaseFingerprint).not.toHaveBeenCalled();
    expect(mocks.registerBase.mock.calls[0][0].baseFingerprint).toEqual(pushFingerprint);
    const payload = mocks.asyncUploadSpy.mock.calls[0][0];
    expect(payload.baseFingerprint).toBe('taken-by-the-push');
    expect(payload.nativeFingerprint).toBe('native-taken-by-the-push');

    // A hand-over file from an older CLI carries none, so the hook still takes one itself.
    vi.clearAllMocks();
    await asyncUploadBuildAndRunTests(BASE_ARGS);

    expect(mocks.computeBaseFingerprint).toHaveBeenCalledTimes(1);
    expect(mocks.asyncUploadSpy.mock.calls[0][0].baseFingerprint).toBe('taken-after-the-build');
  });
});
