/**
 * Unit tests proving that asyncUploadBuildAndRunTests (EAS-cloud path) sends
 * changedFiles + nativeFingerprint to the asyncUpload API, and correctly omits
 * changedFiles on bail-to-full conditions (shallow / dirty / no mergeBaseSha).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks - created before any vi.mock() factory runs so they can be
// referenced by both the factory bodies and the test bodies.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const asyncUploadSpy = vi.fn().mockResolvedValue({ couldRunThisBuildRightNow: false });
  return {
    asyncUploadSpy,
    sdkClient: vi.fn().mockReturnValue({ asyncUpload: asyncUploadSpy }),
    getGitInfo: vi.fn(),
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
    printResultsUrl: vi.fn(),
    uploadOrPrintBinaryReuse: vi.fn().mockResolvedValue(undefined),
    reporting: { addBreadcrumb: vi.fn() },
    getAppBuildUrl: vi.fn().mockReturnValue('https://app.sherlo.io/test/1'),
    collectDependencyGraph: vi.fn().mockReturnValue(null),
    computeChangedFiles: vi.fn(),
    computeNativeFingerprint: vi.fn(),
    getBuildPath: vi.fn().mockReturnValue('/tmp/app.apk'),
  };
});

vi.mock('@sherlo/sdk-client', () => ({ default: mocks.sdkClient }));

vi.mock('../../../../../helpers', () => ({
  getAppBuildUrl: mocks.getAppBuildUrl,
  getGitInfo: mocks.getGitInfo,
  getTokenParts: mocks.getTokenParts,
  getValidatedBinariesInfoAndNextBuildIndex: mocks.getValidatedBinariesInfoAndNextBuildIndex,
  handleClientError: mocks.handleClientError,
  printResultsUrl: mocks.printResultsUrl,
  uploadOrPrintBinaryReuse: mocks.uploadOrPrintBinaryReuse,
  reporting: mocks.reporting,
}));

vi.mock('../../../../../helpers/turbosnap', () => ({
  collectDependencyGraph: mocks.collectDependencyGraph,
  computeChangedFiles: mocks.computeChangedFiles,
  computeNativeFingerprint: mocks.computeNativeFingerprint,
}));

vi.mock('../getBuildPath', () => ({ default: mocks.getBuildPath }));

import asyncUploadBuildAndRunTests from '../asyncUploadBuildAndRunTests';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE_ARGS = {
  buildIndex: 1,
  easBuildProfile: 'preview',
  token: 'AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMn1',
};

const BASE_GIT_INFO = {
  branchName: 'feature/my-pr',
  commitHash: 'prhead1234',
  commitName: 'feat: my changes',
  isShallow: false,
  isDirty: false,
  mergeBaseSha: 'forkpoint789',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('asyncUploadBuildAndRunTests – TurboSnap (changedFiles + nativeFingerprint)', () => {
  beforeEach(() => {
    process.env.EAS_BUILD_PLATFORM = 'android';
    mocks.getGitInfo.mockResolvedValue(BASE_GIT_INFO);
    mocks.computeNativeFingerprint.mockResolvedValue('fp-abc123');
    mocks.asyncUploadSpy.mockClear();
  });

  afterEach(() => {
    delete process.env.EAS_BUILD_PLATFORM;
    vi.clearAllMocks();
  });

  it('passes changedFiles and nativeFingerprint when git state is clean PR build', async () => {
    mocks.computeChangedFiles.mockResolvedValue({
      changedFiles: ['src/Button.tsx', 'src/Modal.tsx'],
    });

    await asyncUploadBuildAndRunTests(BASE_ARGS);

    expect(mocks.asyncUploadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        changedFiles: ['src/Button.tsx', 'src/Modal.tsx'],
        nativeFingerprint: 'fp-abc123',
      })
    );
  });

  it('omits changedFiles (bail-to-full) on a shallow clone', async () => {
    mocks.getGitInfo.mockResolvedValue({ ...BASE_GIT_INFO, isShallow: true });
    mocks.computeChangedFiles.mockResolvedValue({
      fullRun: true,
      reason: 'shallow clone: ancestry is grafted, diff base is untrustworthy',
    });

    await asyncUploadBuildAndRunTests(BASE_ARGS);

    const callArgs = mocks.asyncUploadSpy.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    expect(callArgs.changedFiles).toBeUndefined();
  });

  it('omits changedFiles (bail-to-full) on a dirty working tree', async () => {
    mocks.getGitInfo.mockResolvedValue({ ...BASE_GIT_INFO, isDirty: true });
    mocks.computeChangedFiles.mockResolvedValue({
      fullRun: true,
      reason: 'dirty working tree: uncommitted changes invalidate the diff',
    });

    await asyncUploadBuildAndRunTests(BASE_ARGS);

    const callArgs = mocks.asyncUploadSpy.mock.calls[0]?.[0];
    expect(callArgs.changedFiles).toBeUndefined();
  });

  it('omits changedFiles when mergeBaseSha is absent (non-PR / push build)', async () => {
    const { mergeBaseSha: _omit, ...gitInfoNoPR } = BASE_GIT_INFO;
    mocks.getGitInfo.mockResolvedValue(gitInfoNoPR);
    mocks.computeChangedFiles.mockResolvedValue({
      fullRun: true,
      reason: 'not on a PR merge ref: no fork point available to diff from',
    });

    await asyncUploadBuildAndRunTests(BASE_ARGS);

    const callArgs = mocks.asyncUploadSpy.mock.calls[0]?.[0];
    expect(callArgs.changedFiles).toBeUndefined();
  });

  it('still sends nativeFingerprint even when changedFiles bail to full', async () => {
    mocks.computeChangedFiles.mockResolvedValue({
      fullRun: true,
      reason: 'shallow clone: ancestry is grafted, diff base is untrustworthy',
    });
    mocks.computeNativeFingerprint.mockResolvedValue('fp-xyz789');

    await asyncUploadBuildAndRunTests(BASE_ARGS);

    const callArgs = mocks.asyncUploadSpy.mock.calls[0]?.[0];
    expect(callArgs.nativeFingerprint).toBe('fp-xyz789');
    expect(callArgs.changedFiles).toBeUndefined();
  });

  it('sends undefined nativeFingerprint when @expo/fingerprint is unavailable', async () => {
    mocks.computeChangedFiles.mockResolvedValue({ changedFiles: ['App.tsx'] });
    mocks.computeNativeFingerprint.mockResolvedValue(null);

    await asyncUploadBuildAndRunTests(BASE_ARGS);

    const callArgs = mocks.asyncUploadSpy.mock.calls[0]?.[0];
    expect(callArgs.nativeFingerprint).toBeUndefined();
  });
});
