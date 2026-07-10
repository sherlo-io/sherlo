/**
 * Contract tests for the openBuild payload assembled by
 * uploadOrReuseBuildsAndRunTests - the CLI -> api "front door".
 *
 * Everything below the decision spine is stubbed (sdk-client, each helper
 * module, diffScope, fingerprint) so we exercise ONLY the payload assembly and
 * branch selection - no git, no S3, no network, no hashing.
 *
 * This file is deliberately named `openBuildPayload.contract.test.ts` so the
 * future contract-fixtures ticket can find the exact openBuild wire shape here.
 *
 * getGitInfo is NOT re-tested here (it has a real-git suite); we stub it and
 * assert its output flows verbatim into the payload.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted spies
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const openBuild = vi.fn();
  return {
    openBuild,
    sdkClient: vi.fn().mockReturnValue({ openBuild }),
    getTokenParts: vi.fn(),
    getValidatedBinariesInfoAndNextBuildIndex: vi.fn(),
    uploadOrPrintBinaryReuse: vi.fn(),
    getGitInfo: vi.fn(),
    getBuildRunConfig: vi.fn(),
    getAppBuildUrl: vi.fn(),
    printBuildIntroMessage: vi.fn(),
    printResultsUrl: vi.fn(),
    handleClientError: vi.fn((error: unknown) => {
      // Mirror the real helper's contract: it never swallows an error.
      throw error;
    }),
    reporting: { addBreadcrumb: vi.fn(), setTag: vi.fn(), flush: vi.fn() },
    computeChangedFiles: vi.fn(),
    computeNativeFingerprint: vi.fn(),
    computeBaseFingerprint: vi.fn(),
    registerBase: vi.fn(),
    waitForBuildResult: vi.fn(),
    logWarning: vi.fn(),
  };
});

vi.mock('@sherlo/sdk-client', () => ({ default: mocks.sdkClient }));
vi.mock('../getTokenParts', () => ({ default: mocks.getTokenParts }));
vi.mock('../getValidatedBinariesInfoAndNextBuildIndex', () => ({
  default: mocks.getValidatedBinariesInfoAndNextBuildIndex,
}));
vi.mock('../uploadOrPrintBinaryReuse', () => ({ default: mocks.uploadOrPrintBinaryReuse }));
vi.mock('../getGitInfo', () => ({ default: mocks.getGitInfo }));
vi.mock('../getBuildRunConfig', () => ({ default: mocks.getBuildRunConfig }));
vi.mock('../getAppBuildUrl', () => ({ default: mocks.getAppBuildUrl }));
vi.mock('../printBuildIntroMessage', () => ({ default: mocks.printBuildIntroMessage }));
vi.mock('../printResultsUrl', () => ({ default: mocks.printResultsUrl }));
vi.mock('../handleClientError', () => ({ default: mocks.handleClientError }));
vi.mock('../reporting', () => ({ default: mocks.reporting }));
vi.mock('../logWarning', () => ({ default: mocks.logWarning }));
vi.mock('../waitForBuildResult', () => ({ default: mocks.waitForBuildResult }));
vi.mock('../diffScope', () => ({
  computeChangedFiles: mocks.computeChangedFiles,
  computeNativeFingerprint: mocks.computeNativeFingerprint,
}));
vi.mock('../fingerprint', () => ({
  computeBaseFingerprint: mocks.computeBaseFingerprint,
  registerBase: mocks.registerBase,
}));

import uploadOrReuseBuildsAndRunTests from '../uploadOrReuseBuildsAndRunTests';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Sentinels we assert flow through verbatim (identity where possible).
const GIT_INFO = {
  branchName: 'feature/my-pr',
  commitHash: 'prhead1234',
  commitName: 'feat: my changes',
  isShallow: false,
  isDirty: false,
  mergeBaseSha: 'forkpoint789',
};
const BUILD_RUN_CONFIG = { __buildRunConfig: true } as any;

const BINARIES_INFO = {
  android: {
    hash: 'android-hash',
    fileName: 'app.apk',
    s3Key: 'android-s3-key',
    buildType: 'preview',
  },
  ios: { hash: 'ios-hash', fileName: 'app.app', s3Key: 'ios-s3-key', buildType: 'preview' },
  sdkVersion: '2.0.0',
};

const COMMAND_PARAMS = {
  projectRoot: '/proj',
  token: 'the-token',
  android: '/builds/app.apk',
  ios: '/builds/app.app',
  message: 'my build message',
  gitBranch: 'flag-branch',
  fullRun: false,
  wait: false,
  waitTimeout: undefined,
  devices: [],
} as any;

function callSubject(overrides: { easUpdateData?: any } = {}) {
  return uploadOrReuseBuildsAndRunTests({
    commandParams: COMMAND_PARAMS,
    easUpdateData: overrides.easUpdateData,
  });
}

function lastOpenBuildPayload() {
  return mocks.openBuild.mock.calls[0][0];
}

// ---------------------------------------------------------------------------
// Default happy-path wiring (each test may override individual stubs)
// ---------------------------------------------------------------------------

beforeEach(() => {
  mocks.getTokenParts.mockReturnValue({ apiToken: 'api-tok', projectIndex: 7, teamId: 'team1234' });
  mocks.getValidatedBinariesInfoAndNextBuildIndex.mockResolvedValue({
    binariesInfo: BINARIES_INFO,
    nextBuildIndex: 3,
  });
  mocks.uploadOrPrintBinaryReuse.mockResolvedValue(undefined);
  mocks.getGitInfo.mockResolvedValue(GIT_INFO);
  mocks.getBuildRunConfig.mockReturnValue(BUILD_RUN_CONFIG);
  mocks.computeChangedFiles.mockResolvedValue({ changedFiles: ['src/Button.tsx'] });
  mocks.computeNativeFingerprint.mockResolvedValue('native-fp');
  mocks.computeBaseFingerprint.mockResolvedValue({ hash: null });
  mocks.registerBase.mockResolvedValue({ gateMetadata: undefined });
  mocks.getAppBuildUrl.mockReturnValue('https://app.sherlo.io/team1234/7/build/42');
  mocks.openBuild.mockResolvedValue({ build: { index: 42 } });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// openBuild payload shape
// ---------------------------------------------------------------------------

describe('openBuild payload - core shape', () => {
  it('assembles the exact payload from token parts, binaries, git and diff scope', async () => {
    await callSubject();

    expect(mocks.openBuild).toHaveBeenCalledTimes(1);
    const payload = lastOpenBuildPayload();

    expect(payload).toMatchObject({
      teamId: 'team1234',
      projectIndex: 7,
      binaryHashes: { android: 'android-hash', ios: 'ios-hash' },
      binaryFileNames: { android: 'app.apk', ios: 'app.app' },
      sdkVersion: '2.0.0',
      message: 'my build message',
      changedFiles: ['src/Button.tsx'],
      nativeFingerprint: 'native-fp',
    });
    // buildRunConfig + gitInfo flow through by identity (no reshaping).
    expect(payload.buildRunConfig).toBe(BUILD_RUN_CONFIG);
    expect(payload.gitInfo).toBe(GIT_INFO);
  });

  it('forwards the full GitInfo object verbatim (passthrough, no reshaping)', async () => {
    await callSubject();
    expect(lastOpenBuildPayload().gitInfo).toBe(GIT_INFO);
  });

  it('returns the app build url from getAppBuildUrl', async () => {
    await expect(callSubject()).resolves.toEqual({
      url: 'https://app.sherlo.io/team1234/7/build/42',
    });
    expect(mocks.getAppBuildUrl).toHaveBeenCalledWith({
      buildIndex: 42,
      projectIndex: 7,
      teamId: 'team1234',
    });
  });
});

// ---------------------------------------------------------------------------
// Conditional baseFingerprint / gateMetadata spread - BOTH branches
// ---------------------------------------------------------------------------

describe('openBuild payload - baseFingerprint/gateMetadata spread', () => {
  it('OMITS baseFingerprint and gateMetadata when no base fingerprint is available', async () => {
    mocks.computeBaseFingerprint.mockResolvedValue({ hash: null });

    await callSubject();
    const payload = lastOpenBuildPayload();

    expect(payload).not.toHaveProperty('baseFingerprint');
    expect(payload).not.toHaveProperty('gateMetadata');
  });

  it('INCLUDES baseFingerprint and per-platform gateMetadata when a base fingerprint exists', async () => {
    mocks.computeBaseFingerprint.mockResolvedValue({ hash: 'base-fp-hash' });
    mocks.registerBase.mockResolvedValue({ gateMetadata: { engineClass: 'hermes' } });

    await callSubject();
    const payload = lastOpenBuildPayload();

    expect(payload.baseFingerprint).toBe('base-fp-hash');
    // Both platforms are present + requested, so both carry gate metadata.
    expect(payload.gateMetadata).toEqual({
      android: { engineClass: 'hermes' },
      ios: { engineClass: 'hermes' },
    });
  });

  it('still includes baseFingerprint with empty gateMetadata when registerBase yields none', async () => {
    mocks.computeBaseFingerprint.mockResolvedValue({ hash: 'base-fp-hash' });
    mocks.registerBase.mockResolvedValue({ gateMetadata: undefined });

    await callSubject();
    const payload = lastOpenBuildPayload();

    expect(payload.baseFingerprint).toBe('base-fp-hash');
    expect(payload.gateMetadata).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Diff scope pass-through
// ---------------------------------------------------------------------------

describe('openBuild payload - diff scope', () => {
  it('omits changedFiles (bail-to-full) but still sends nativeFingerprint', async () => {
    mocks.computeChangedFiles.mockResolvedValue({
      fullRun: true,
      reason: 'shallow clone: ancestry is grafted',
    });
    mocks.computeNativeFingerprint.mockResolvedValue('native-fp');

    await callSubject();
    const payload = lastOpenBuildPayload();

    expect(payload.changedFiles).toBeUndefined();
    expect(payload.nativeFingerprint).toBe('native-fp');
  });

  it('sends undefined nativeFingerprint when fingerprint is unavailable', async () => {
    mocks.computeNativeFingerprint.mockResolvedValue(null);

    await callSubject();
    expect(lastOpenBuildPayload().nativeFingerprint).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Reuse-vs-upload decision + s3 key wiring
// ---------------------------------------------------------------------------

describe('reuse-vs-upload branch selection', () => {
  it('delegates the reuse/upload decision to uploadOrPrintBinaryReuse with binaries + platform paths', async () => {
    await callSubject();

    expect(mocks.uploadOrPrintBinaryReuse).toHaveBeenCalledWith({
      binariesInfo: BINARIES_INFO,
      projectRoot: '/proj',
      android: '/builds/app.apk',
      ios: '/builds/app.app',
    });
  });

  it('wires the per-platform binary s3 keys into getBuildRunConfig', async () => {
    await callSubject();

    expect(mocks.getBuildRunConfig).toHaveBeenCalledWith({
      commandParams: COMMAND_PARAMS,
      binaryS3Keys: { android: 'android-s3-key', ios: 'ios-s3-key' },
      easUpdateData: undefined,
    });
  });

  it('carries the binary hashes (the reuse key) into the openBuild payload', async () => {
    await callSubject();
    expect(lastOpenBuildPayload().binaryHashes).toEqual({
      android: 'android-hash',
      ios: 'ios-hash',
    });
  });
});

// ---------------------------------------------------------------------------
// Error propagation from each stubbed stage
// ---------------------------------------------------------------------------

describe('error propagation', () => {
  it('propagates a failure from getValidatedBinariesInfoAndNextBuildIndex', async () => {
    mocks.getValidatedBinariesInfoAndNextBuildIndex.mockRejectedValue(
      new Error('binaries validation failed')
    );

    await expect(callSubject()).rejects.toThrow('binaries validation failed');
    expect(mocks.openBuild).not.toHaveBeenCalled();
  });

  it('propagates a failure from getGitInfo', async () => {
    mocks.getGitInfo.mockRejectedValue(new Error('git info failed'));

    await expect(callSubject()).rejects.toThrow('git info failed');
    expect(mocks.openBuild).not.toHaveBeenCalled();
  });

  it('routes an openBuild rejection through handleClientError (which rethrows)', async () => {
    mocks.openBuild.mockRejectedValue(new Error('openBuild network error'));

    await expect(callSubject()).rejects.toThrow('openBuild network error');
    expect(mocks.handleClientError).toHaveBeenCalledTimes(1);
  });
});
