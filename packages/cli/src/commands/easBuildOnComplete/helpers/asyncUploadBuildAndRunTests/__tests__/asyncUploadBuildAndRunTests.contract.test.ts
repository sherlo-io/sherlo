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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const asyncUploadSpy = vi.fn().mockResolvedValue({ couldRunThisBuildRightNow: false });
  return {
    asyncUploadSpy,
    sdkClient: vi.fn().mockReturnValue({ asyncUpload: asyncUploadSpy }),
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
    printResultsUrl: vi.fn(),
    uploadOrPrintBinaryReuse: vi.fn().mockResolvedValue(undefined),
    reporting: { addBreadcrumb: vi.fn() },
    getAppBuildUrl: vi.fn().mockReturnValue('https://app.sherlo.io/test/1'),
    computeBaseFingerprint: vi.fn().mockResolvedValue({ hash: null, nativeFingerprint: 'fp-abc' }),
    registerBase: vi.fn().mockResolvedValue({ registered: false }),
    getBuildPath: vi.fn().mockReturnValue('/tmp/app.apk'),
  };
});

vi.mock('@sherlo/sdk-client', () => ({ default: mocks.sdkClient }));

vi.mock('../../../../../helpers', () => ({
  getAppBuildUrl: mocks.getAppBuildUrl,
  getTokenParts: mocks.getTokenParts,
  getValidatedBinariesInfoAndNextBuildIndex: mocks.getValidatedBinariesInfoAndNextBuildIndex,
  handleClientError: mocks.handleClientError,
  logWarning: mocks.logWarning,
  printResultsUrl: mocks.printResultsUrl,
  uploadOrPrintBinaryReuse: mocks.uploadOrPrintBinaryReuse,
  reporting: mocks.reporting,
}));

vi.mock('../getBuildPath', () => ({ default: mocks.getBuildPath }));

vi.mock('../../../../../helpers/fingerprint', () => ({
  computeBaseFingerprint: mocks.computeBaseFingerprint,
  registerBase: mocks.registerBase,
}));

import asyncUploadBuildAndRunTests from '../asyncUploadBuildAndRunTests';

const BASE_ARGS = {
  buildIndex: 1,
  easBuildProfile: 'preview',
  token: 'AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMn1',
};

describe('asyncUploadBuildAndRunTests - asyncUpload payload contract', () => {
  beforeEach(() => {
    process.env.EAS_BUILD_PLATFORM = 'android';
    vi.spyOn(console, 'log').mockImplementation(() => {});
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
});
