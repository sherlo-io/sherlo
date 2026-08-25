/**
 * Contract tests for the openBuild payload assembled by
 * uploadOrReuseBuildsAndRunTests - the CLI -> api "front door".
 *
 * Everything below the decision spine is stubbed (sdk-client, each helper
 * module, fingerprint) so we exercise ONLY the payload assembly and branch
 * selection - no git, no S3, no network, no hashing.
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
  const CLIENT = { openBuild };
  const MANIFEST_EFFECTS = {};
  return {
    openBuild,
    client: CLIENT,
    sdkClient: vi.fn().mockReturnValue(CLIENT),
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
    computeBaseFingerprint: vi.fn(),
    registerBase: vi.fn(),
    waitForBuildResult: vi.fn(),
    logWarning: vi.fn(),
    emitAndUploadModuleManifests: vi.fn(),
    /**
     * The effects bundle `uploadOrReuseBuildsAndRunTests` builds for its manifest
     * pass. The module is mocked WHOLESALE below, so every export the subject
     * reaches has to be present here - and this one is reached unconditionally,
     * before any branch the tests are about.
     *
     * It returns a SENTINEL, not a fresh object: nothing here is ever called
     * (the pass itself is `emitAndUploadModuleManifests`, already mocked above,
     * and these effects are only its argument), so the only thing worth
     * asserting is identity - that the bundle built from THIS client is the one
     * the pass receives.
     */
    manifestEffects: MANIFEST_EFFECTS,
    realManifestEffects: vi.fn(() => MANIFEST_EFFECTS),
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
vi.mock('../fingerprint', () => ({
  computeBaseFingerprint: mocks.computeBaseFingerprint,
  registerBase: mocks.registerBase,
}));
// A whole-module factory REPLACES the module: an export missing here does not
// fall through to the real one, it throws on first access. So this must list
// every export the subject touches, not only the ones a test asserts on.
vi.mock('../emitAndUploadModuleManifests', () => ({
  emitAndUploadModuleManifests: mocks.emitAndUploadModuleManifests,
  realManifestEffects: mocks.realManifestEffects,
}));

import uploadOrReuseBuildsAndRunTests from '../uploadOrReuseBuildsAndRunTests';
// NOT mocked: `../uploadOrPrintBinaryReuse` is replaced wholesale above, but
// `../uploadOrPrintBinaryReuse/uploadBuild` is a different module, so this is
// the real effects bundle - the exact object identity the subject must inject.
import { REAL_BINARY_UPLOAD_EFFECTS } from '../uploadOrPrintBinaryReuse/uploadBuild';

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
  // The `nativeFingerprint` wire value is sourced from the single sanitized
  // Layer-1 compute (SHERLO-1756): `computeBaseFingerprint` returns it
  // as `nativeFingerprint`. Default to a null base hash (base-fingerprint branch
  // off) that still carries a Layer-1 nativeFingerprint, so the wire path is
  // exercised independently of the base-fingerprint spread.
  mocks.computeBaseFingerprint.mockResolvedValue({ hash: null, nativeFingerprint: 'native-fp' });
  mocks.registerBase.mockResolvedValue({ gateMetadata: undefined });
  mocks.emitAndUploadModuleManifests.mockResolvedValue({});
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
  it('assembles the exact payload from token parts, binaries, git and fingerprint', async () => {
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
      nativeFingerprint: 'native-fp',
    });
    // buildRunConfig + gitInfo flow through by identity (no reshaping).
    expect(payload.buildRunConfig).toBe(BUILD_RUN_CONFIG);
    expect(payload.gitInfo).toBe(GIT_INFO);

    // The client MUST NOT send `changedFiles` on the openBuild payload. This is a
    // deliberate client-side contract, not an incidental omission: Diff Scope is
    // now computed server-side, and the wire schema still ACCEPTS `changedFiles`
    // so older published CLIs keep working. Because the shape assertion above uses
    // `toMatchObject` (which ignores unlisted keys), this explicit negative is the
    // only thing that keeps the field from silently returning via a bad merge or a
    // restored helper. Do not delete it as redundant.
    expect(payload).not.toHaveProperty('changedFiles');
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
// nativeFingerprint pass-through
// ---------------------------------------------------------------------------

describe('openBuild payload - nativeFingerprint', () => {
  it('sends nativeFingerprint from the single Layer-1 compute', async () => {
    // nativeFingerprint is sourced from the single Layer-1 compute (default mock
    // supplies 'native-fp'), independent of the base-fingerprint branch.
    await callSubject();
    expect(lastOpenBuildPayload().nativeFingerprint).toBe('native-fp');
  });

  it('sends undefined nativeFingerprint when fingerprint is unavailable', async () => {
    // A failed Layer-1 compute returns no nativeFingerprint (fail-soft).
    mocks.computeBaseFingerprint.mockResolvedValue({ hash: null });

    await callSubject();
    expect(lastOpenBuildPayload().nativeFingerprint).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Reuse-vs-upload decision + s3 key wiring
// ---------------------------------------------------------------------------

describe('reuse-vs-upload branch selection', () => {
  it('delegates the reuse/upload decision to uploadOrPrintBinaryReuse with binaries + platform paths, the upload effects and an injected clock', async () => {
    await callSubject();

    expect(mocks.uploadOrPrintBinaryReuse).toHaveBeenCalledWith({
      binariesInfo: BINARIES_INFO,
      projectRoot: '/proj',
      android: '/builds/app.apk',
      ios: '/builds/app.app',
      // Both seams are asserted ON PURPOSE, so a refactor that silently stops
      // injecting either one reds here:
      //
      // - `uploadEffects` is the mechanism the whole render/expectation layer
      //   rests on: an expectation producer swaps this bundle to run the real
      //   upload block offline. A subject that stopped passing it would send
      //   the producer down a different code path than the shipped one.
      // - `now` fixes the instant a reuse line's "N minutes ago" is measured
      //   against. It exists because `getTimeAgo` used to read the wall clock
      //   directly, so a captured reuse line drifted from "7 minutes ago" to
      //   "1 week ago" as the calendar moved. Dropping the injection would
      //   reintroduce that bug; only the seam is contractual here, not the
      //   value, so the type is what is asserted.
      uploadEffects: REAL_BINARY_UPLOAD_EFFECTS,
      now: expect.any(Date),
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
// Module manifest wiring (SHERLO-1943) - reuses the SAME producer as
// test:bundled via emitAndUploadModuleManifests; only the wiring at the
// openBuild-payload boundary is exercised here (the producer/guard logic has
// its own suite in emitAndUploadModuleManifests.test.ts).
// ---------------------------------------------------------------------------

describe('module manifest wiring (SHERLO-1943)', () => {
  beforeEach(() => {
    mocks.computeBaseFingerprint.mockResolvedValue({ hash: 'base-fp-hash' });
    mocks.registerBase.mockResolvedValue({ gateMetadata: undefined });
    mocks.getBuildRunConfig.mockReturnValue({ android: {}, ios: {} });
  });

  it('runs the manifest pass with the platforms being registered + the SAME gitInfo and the effects built from the client, only when a base fingerprint exists', async () => {
    await callSubject();

    expect(mocks.emitAndUploadModuleManifests).toHaveBeenCalledTimes(1);
    expect(mocks.emitAndUploadModuleManifests).toHaveBeenCalledWith({
      client: mocks.client,
      projectRoot: '/proj',
      platforms: ['android', 'ios'],
      gitInfo: GIT_INFO,
      projectIndex: 7,
      teamId: 'team1234',
      // Asserted ON PURPOSE: the effects bundle is the seam an expectation
      // producer swaps to run this exact pass offline. A refactor that stopped
      // injecting it would send the producer down a different path than the
      // shipped one, so its disappearance must red here. Identity is the
      // assertion - the bundle handed over is the one built from this client.
      effects: mocks.manifestEffects,
    });
    expect(mocks.realManifestEffects).toHaveBeenCalledWith(mocks.client);
  });

  it('never runs the manifest pass when there is no base fingerprint (nothing to compare it against)', async () => {
    mocks.computeBaseFingerprint.mockResolvedValue({ hash: null });

    await callSubject();

    expect(mocks.emitAndUploadModuleManifests).not.toHaveBeenCalled();
  });

  it('mirrors manifestS3Key onto each platform config when the pass vouched and uploaded (present)', async () => {
    mocks.emitAndUploadModuleManifests.mockResolvedValue({
      android: 'android-manifest-key',
      ios: 'ios-manifest-key',
    });

    await callSubject();
    const payload = lastOpenBuildPayload();

    expect(payload.buildRunConfig.android.manifestS3Key).toBe('android-manifest-key');
    expect(payload.buildRunConfig.ios.manifestS3Key).toBe('ios-manifest-key');
  });

  it('does NOT set manifestS3Key when the pass was skipped/failed (bail-open, absent)', async () => {
    mocks.emitAndUploadModuleManifests.mockResolvedValue({});

    await callSubject();
    const payload = lastOpenBuildPayload();

    expect('manifestS3Key' in payload.buildRunConfig.android).toBe(false);
    expect('manifestS3Key' in payload.buildRunConfig.ios).toBe(false);
  });

  it('sets manifestS3Key only for the platform that got one (partial vouch/upload)', async () => {
    mocks.emitAndUploadModuleManifests.mockResolvedValue({ ios: 'ios-manifest-key' });

    await callSubject();
    const payload = lastOpenBuildPayload();

    expect('manifestS3Key' in payload.buildRunConfig.android).toBe(false);
    expect(payload.buildRunConfig.ios.manifestS3Key).toBe('ios-manifest-key');
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
