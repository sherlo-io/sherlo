/**
 * Contract tests for the openBuild payload assembled by
 * uploadOrReuseBuildsAndRunTests - the CLI -> api "front door".
 *
 * Everything below the decision spine is stubbed (sdk-client, each helper
 * module, fingerprint) so we exercise ONLY the payload assembly and branch
 * selection - no git, no S3, no network, no hashing. The one thing kept REAL is
 * applyBundleToPlatformConfig: the fields it writes ARE the contract the runner
 * reads, so the fresh-bundle cases below assert them through the shipped code.
 *
 * This file is deliberately named `openBuildPayload.contract.test.ts` so the
 * future contract-fixtures ticket can find the exact openBuild wire shape here.
 *
 * getGitInfo is NOT re-tested here (it has a real-git suite); we stub it and
 * assert its output flows verbatim into the payload.
 */
import { keysTheApiRejects } from './openBuildPlatformConfigKeys';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted spies
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const openBuild = vi.fn();
  const CLIENT = { openBuild };
  const FRESH_BUNDLE_EFFECTS = {};
  return {
    openBuild,
    client: CLIENT,
    sdkClient: vi.fn().mockReturnValue(CLIENT),
    getValidatedBinariesInfoAndNextBuildIndex: vi.fn(),
    uploadOrPrintBinaryReuse: vi.fn(),
    getGitInfo: vi.fn(),
    getBuildRunConfig: vi.fn(),
    getAppBuildUrl: vi.fn(),
    printTestStarted: vi.fn(),
    closeTheRun: vi.fn(),
    handleClientError: vi.fn((error: unknown) => {
      // Mirror the real helper's contract: it never swallows an error.
      throw error;
    }),
    reporting: { addBreadcrumb: vi.fn(), setTag: vi.fn(), flush: vi.fn() },
    registerBase: vi.fn(),
    isServerBypassed: vi.fn(() => false),
    logWarning: vi.fn(),
    uploadFreshBundles: vi.fn(),
    /**
     * The effects bundle `uploadOrReuseBuildsAndRunTests` builds for the fresh
     * bundle step. The module is mocked WHOLESALE below, so every export the
     * subject reaches has to be present here - and this one is reached
     * unconditionally, before any branch the tests are about.
     *
     * It returns a SENTINEL, not a fresh object: nothing here is ever called
     * (the step itself is mocked above, and the effects are only its argument),
     * so the only thing worth asserting is identity - that the bundle built
     * from THIS client is the one the step receives.
     */
    freshBundleEffects: FRESH_BUNDLE_EFFECTS,
    realFreshBundleEffects: vi.fn(() => FRESH_BUNDLE_EFFECTS),
  };
});

vi.mock('@sherlo/sdk-client', () => ({ default: mocks.sdkClient }));
vi.mock('../getValidatedBinariesInfoAndNextBuildIndex', () => ({
  default: mocks.getValidatedBinariesInfoAndNextBuildIndex,
}));
vi.mock('../uploadOrPrintBinaryReuse', () => ({ default: mocks.uploadOrPrintBinaryReuse }));
// `getGitInfo` is the SEAM's dispatcher (../../seams/surroundings) now, and what this file
// stubs is the git read behind it. The seam's live half reaches for `readGitInfoFromDisk`, so a
// factory that returned only a default would leave that import undefined at module load.
vi.mock('../getGitInfo', () => ({
  readGitInfoFromDisk: mocks.getGitInfo,
  degradeGitInfo: vi.fn(),
}));
vi.mock('../../seams/surroundings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../seams/surroundings')>()),
  getGitInfo: mocks.getGitInfo,
}));
vi.mock('../getBuildRunConfig', () => ({ default: mocks.getBuildRunConfig }));
vi.mock('../getAppBuildUrl', () => ({ default: mocks.getAppBuildUrl }));
// The run's started line and its ending are the staged road's own (../../commands/test), stubbed
// here: what this file pins is the payload the spine sends.
vi.mock('../../commands/test/startTheTest', () => ({ printTestStarted: mocks.printTestStarted }));
vi.mock('../../commands/test/closeTheRun', () => ({ closeTheRun: mocks.closeTheRun }));
vi.mock('../handleClientError', () => ({ default: mocks.handleClientError }));
vi.mock('../reporting', () => ({ default: mocks.reporting }));
vi.mock('../logWarning', () => ({ default: mocks.logWarning }));
vi.mock('../waitForBuildResult', () => ({ isServerBypassed: mocks.isServerBypassed }));
vi.mock('../fingerprint', () => ({
  registerBase: mocks.registerBase,
}));
// A whole-module factory REPLACES the module: an export missing here does not
// fall through to the real one, it throws on first access. So this must list
// every export the subject touches, not only the ones a test asserts on.
vi.mock('../uploadFreshBundles', () => ({
  uploadFreshBundles: mocks.uploadFreshBundles,
  realFreshBundleEffects: mocks.realFreshBundleEffects,
}));

import uploadOrReuseBuildsAndRunTests from '../uploadOrReuseBuildsAndRunTests';
// NOT mocked: `../uploadOrPrintBinaryReuse` is replaced wholesale above, but
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
  credential: {
    kind: 'projectToken',
    token: 'the-token',
    apiToken: 'api-tok',
    projectIndex: 7,
    teamId: 'team1234',
  },
  android: '/builds/app.apk',
  ios: '/builds/app.app',
  message: 'my build message',
  gitBranch: 'flag-branch',
  wait: false,
  waitTimeout: undefined,
  devices: [],
} as any;

/** What the fresh-bundle step hands back on a happy standard-road run. */
const FRESH_BUNDLES = {
  android: {
    keys: { jsBundleS3Key: 'android-js-key', assetsS3Key: 'android-assets-key' },
    bundleSizeMb: 4.29,
  },
  ios: {
    keys: { jsBundleS3Key: 'ios-js-key', manifestS3Key: 'ios-manifest-key' },
    bundleSizeMb: 5.1,
  },
};

/**
 * A fresh config per call, shaped like getBuildRunConfig's output for two
 * platforms with real binary keys. Fresh because the fresh-bundle step WRITES into
 * it, and a shared constant would leak one test's fields into the next.
 */
function buildRunConfig() {
  return {
    android: { devices: [], s3Key: 'android-s3-key' },
    ios: { devices: [], s3Key: 'ios-s3-key' },
  } as any;
}

/** The base fingerprints the build road took before building, handed to the spine. */
let fingerprints: any;

function callSubject(overrides: { commandParams?: any } = {}) {
  const commandParams = overrides.commandParams ?? COMMAND_PARAMS;
  return uploadOrReuseBuildsAndRunTests({
    commandParams,
    // The app builds the push uploads arrive beside the params, as the build road hands them over.
    appBuildPaths: { android: commandParams.android, ios: commandParams.ios },
    fingerprints,
    platformRows: [],
  });
}

function lastOpenBuildPayload() {
  return mocks.openBuild.mock.calls[0][0];
}

// ---------------------------------------------------------------------------
// Default happy-path wiring (each test may override individual stubs)
// ---------------------------------------------------------------------------

beforeEach(() => {
  mocks.getValidatedBinariesInfoAndNextBuildIndex.mockResolvedValue({
    binariesInfo: BINARIES_INFO,
    nextBuildIndex: 3,
  });
  mocks.uploadOrPrintBinaryReuse.mockResolvedValue(undefined);
  mocks.getGitInfo.mockResolvedValue(GIT_INFO);
  mocks.getBuildRunConfig.mockImplementation(buildRunConfig);
  // The `nativeFingerprint` wire value is sourced from the single sanitized
  // Layer-1 compute (SHERLO-1756) the caller hands over: `computeBaseFingerprint`
  // returns it as `nativeFingerprint`. The default is a computed base hash with
  // a registered, spliceable binary per platform - the state a standard-road run
  // needs to start at all.
  fingerprints = {
    android: { hash: 'base-fp-android', nativeFingerprint: 'native-fp' },
    ios: { hash: 'base-fp-ios', nativeFingerprint: 'native-fp' },
  };
  mocks.registerBase.mockImplementation(async ({ platform }: { platform: string }) => ({
    registered: true,
    gateMetadata: { engineClass: 'hermes' },
    sourceList: {
      sources: [{ path: platform, hash: `${platform}-folder`, kind: 'dir' }],
      modules: [],
    },
  }));
  mocks.uploadFreshBundles.mockResolvedValue(FRESH_BUNDLES);
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
      baseFingerprints: { android: 'base-fp-android', ios: 'base-fp-ios' },
    });
    // Each platform's own base: the single project-wide field is no longer sent.
    expect(payload).not.toHaveProperty('baseFingerprint');
    // buildRunConfig + gitInfo flow through by identity (no reshaping).
    expect(payload.buildRunConfig).toBe(mocks.getBuildRunConfig.mock.results[0].value);
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

describe('openBuild payload - a platform that reuses its stored build', () => {
  it("a push that reuses one platform's stored build names that platform's base and settings digest too", async () => {
    await uploadOrReuseBuildsAndRunTests({
      commandParams: COMMAND_PARAMS,
      appBuildPaths: { android: COMMAND_PARAMS.android },
      fingerprints,
      platformsOnStoredBuild: ['ios'],
      platformRows: [],
    });
    const payload = lastOpenBuildPayload();

    expect(payload.baseFingerprints).toEqual({ android: 'base-fp-android', ios: 'base-fp-ios' });
    expect(Object.keys(payload.buildSettingsDigests).sort()).toEqual(['android', 'ios']);
    // Only the uploaded platform registers a base, so only it carries a source list.
    expect(Object.keys(payload.sourceLists)).toEqual(['android']);
  });

  it("a push that reuses one platform's stored build sends that platform's gate facts read from its fresh bundle", async () => {
    const storedGateMetadata = {
      derivedFrom: 'source',
      engineClass: 'hermes',
      bundleFormat: 'hbc',
    };
    mocks.uploadFreshBundles.mockResolvedValue({
      android: FRESH_BUNDLES.android,
      ios: { ...FRESH_BUNDLES.ios, storedBuildGateMetadata: storedGateMetadata },
    });

    await uploadOrReuseBuildsAndRunTests({
      commandParams: COMMAND_PARAMS,
      appBuildPaths: { android: COMMAND_PARAMS.android },
      fingerprints,
      platformsOnStoredBuild: ['ios'],
      platformRows: [],
    });

    // The fresh-bundle step derives gate facts for the stored platform alone.
    expect(mocks.uploadFreshBundles.mock.calls[0][0].platformsOnStoredBuild).toEqual(['ios']);
    // The uploaded platform keeps the facts read out of its binary; the stored one sends its
    // fresh bundle's, which the service diffs against its stored base.
    expect(lastOpenBuildPayload().gateMetadata).toEqual({
      android: { engineClass: 'hermes' },
      ios: storedGateMetadata,
    });
    expect(mocks.registerBase).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Conditional baseFingerprint / gateMetadata spread - BOTH branches
// ---------------------------------------------------------------------------

describe('openBuild payload - baseFingerprint/gateMetadata spread', () => {
  it('INCLUDES baseFingerprint and per-platform gateMetadata when a base fingerprint exists', async () => {
    await callSubject();
    const payload = lastOpenBuildPayload();

    expect(payload.baseFingerprints).toEqual({ android: 'base-fp-android', ios: 'base-fp-ios' });
    // Both platforms are present + requested, so both carry gate metadata.
    expect(payload.gateMetadata).toEqual({
      android: { engineClass: 'hermes' },
      ios: { engineClass: 'hermes' },
    });
    // And the source list each stored base keeps, as its registration made it.
    expect(payload.sourceLists).toEqual({
      android: { sources: [{ path: 'android', hash: 'android-folder', kind: 'dir' }], modules: [] },
      ios: { sources: [{ path: 'ios', hash: 'ios-folder', kind: 'dir' }], modules: [] },
    });
    // Each platform registers under its own base fingerprint.
    expect(mocks.registerBase.mock.calls.map(([params]) => params.baseFingerprint.hash)).toEqual([
      'base-fp-android',
      'base-fp-ios',
    ]);
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
});

// ---------------------------------------------------------------------------
// Reuse-vs-upload decision + s3 key wiring
// ---------------------------------------------------------------------------

describe('reuse-vs-upload branch selection', () => {
  it('delegates the reuse/upload decision to uploadOrPrintBinaryReuse with binaries + platform paths and the upload effects', async () => {
    await callSubject();

    expect(mocks.uploadOrPrintBinaryReuse).toHaveBeenCalledWith({
      binariesInfo: BINARIES_INFO,
      projectRoot: '/proj',
      android: '/builds/app.apk',
      ios: '/builds/app.app',
      // `uploadEffects` is asserted ON PURPOSE, so a refactor that silently stops injecting it reds
      // here. It is the mechanism the whole render/expectation layer rests on: a posed run swaps
      // the machine seam (../../seams/nativeBuild) and the upload block runs offline through it.
      // The subject hands over two thunks onto whichever machine is in force, so the shape is what
      // is asserted here; the seam's own tests pin where the thunks lead.
      uploadEffects: { readBinary: expect.any(Function), putBinary: expect.any(Function) },
    });
  });

  it('wires the per-platform binary s3 keys into getBuildRunConfig', async () => {
    await callSubject();

    expect(mocks.getBuildRunConfig).toHaveBeenCalledWith({
      commandParams: COMMAND_PARAMS,
      binaryS3Keys: { android: 'android-s3-key', ios: 'ios-s3-key' },
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
// EVERY RUN RENDERS A FRESH BUNDLE. The user's binary keeps its own
// s3Key, and the bundle fields the runner splices by are written next to it -
// the shape the api tells apart from a staged run (placeholder s3Key) and from
// an old CLI's full run (no bundle fields) by fields alone.
// ---------------------------------------------------------------------------

describe('the fresh bundle on the platform config', () => {
  it('runs the fresh-bundle step with the registered platforms, the base fingerprint, the caller`s --bundle-dir and the effects built from the client', async () => {
    const buildSettings = { env: { STORYBOOK_ENABLED: 'true' } };
    await callSubject({
      commandParams: { ...COMMAND_PARAMS, bundleDir: '/tmp/bundles', buildSettings },
    });

    expect(mocks.uploadFreshBundles).toHaveBeenCalledTimes(1);
    expect(mocks.uploadFreshBundles).toHaveBeenCalledWith({
      projectRoot: '/proj',
      platforms: ['android', 'ios'],
      // Both platforms upload an app build, so no bundle's gate facts are derived.
      platformsOnStoredBuild: [],
      bundleDir: '/tmp/bundles',
      // The config's `build` block reaches the bundler, as it reaches the app build.
      buildSettings,
      baseFingerprints: { android: 'base-fp-android', ios: 'base-fp-ios' },
      projectIndex: 7,
      teamId: 'team1234',
      // Asserted ON PURPOSE: the effects bundle is the seam an expectation
      // producer swaps to run this exact step offline. Identity is the assertion.
      effects: mocks.freshBundleEffects,
    });
    // The seam builds its own client from the raw token now (../../seams/serverCalls) - the
    // step is handed the token, never a client.
    expect(mocks.realFreshBundleEffects).toHaveBeenCalledWith('the-token');
  });

  it('keeps the REAL binary s3Key and writes the bundle fields beside it, per platform', async () => {
    await callSubject();
    const { android, ios } = lastOpenBuildPayload().buildRunConfig;

    expect(android).toEqual({
      devices: [],
      s3Key: 'android-s3-key',
      jsBundleS3Key: 'android-js-key',
      bundleSizeMb: 4.29,
      assetsS3Key: 'android-assets-key',
    });
    expect(ios).toEqual({
      devices: [],
      s3Key: 'ios-s3-key',
      jsBundleS3Key: 'ios-js-key',
      bundleSizeMb: 5.1,
      manifestS3Key: 'ios-manifest-key',
    });
  });

  it('sends ONLY the fields BuildRunConfigPlatformInput accepts, per platform', async () => {
    await callSubject();
    const { android, ios } = lastOpenBuildPayload().buildRunConfig;

    expect(keysTheApiRejects(android)).toEqual([]);
    expect(keysTheApiRejects(ios)).toEqual([]);
    // The server stamps baseReference from the top-level baseFingerprint; the
    // CLI must never send it (the api rejects the whole openBuild if it does).
    expect(android).not.toHaveProperty('baseReference');
    expect(ios).not.toHaveProperty('baseReference');
  });

  it('only registers and bundles the platforms the caller handed a binary for', async () => {
    await callSubject({ commandParams: { ...COMMAND_PARAMS, ios: undefined } });

    expect(mocks.registerBase).toHaveBeenCalledTimes(1);
    expect(mocks.uploadFreshBundles.mock.calls[0][0].platforms).toEqual(['android']);
  });
});

// ---------------------------------------------------------------------------
// A RUN THAT WOULD RENDER THE EMBEDDED BUNDLE IS REFUSED. A
// binary a bundle cannot be spliced into, or a run with no base to name, is
// refused before anything is bundled, uploaded or opened - naming every reason.
// ---------------------------------------------------------------------------

describe('refusal when the fresh bundle cannot render', () => {
  it('refuses when a binary is not spliceable, quoting the platform and the shipped reason', async () => {
    mocks.registerBase.mockImplementation(async ({ platform }: { platform: string }) =>
      platform === 'ios'
        ? { registered: true, gateMetadata: {} }
        : {
            registered: false,
            gateMetadata: {},
            notStageableReason: 'No embedded bundle found at the default path.',
          }
    );

    await expect(callSubject()).rejects.toThrow(
      /Android: No embedded bundle found at the default path\./
    );

    expect(mocks.uploadFreshBundles).not.toHaveBeenCalled();
    expect(mocks.openBuild).not.toHaveBeenCalled();
  });

  it('refuses when there is no base fingerprint to splice against, quoting why', async () => {
    const unavailable = { hash: null, debugMessage: 'no native project found' };
    fingerprints = { android: unavailable, ios: unavailable };

    await expect(callSubject()).rejects.toThrow(/base fingerprint: no native project found/);

    expect(mocks.uploadFreshBundles).not.toHaveBeenCalled();
    expect(mocks.openBuild).not.toHaveBeenCalled();
  });

  it('names every reason at once', async () => {
    mocks.registerBase.mockResolvedValue({
      registered: false,
      gateMetadata: {},
      notStageableReason: 'RAM/indexed bundle format detected.',
    });

    const refusal = await callSubject().catch((error: Error) => error.message);

    expect(refusal).toContain('Android: RAM/indexed bundle format detected.');
    expect(refusal).toContain('iOS: RAM/indexed bundle format detected.');
  });

  it('treats a registration whose gate metadata could not be read as not spliceable', async () => {
    mocks.registerBase.mockResolvedValue({ registered: false });

    await expect(callSubject()).rejects.toThrow(/gate metadata could not be read/);
  });

  it('lets a fresh-bundle failure end the run without opening a build', async () => {
    mocks.uploadFreshBundles.mockRejectedValue(new Error('Staged upload slot missing for ios.'));

    await expect(callSubject()).rejects.toThrow('Staged upload slot missing for ios.');
    expect(mocks.openBuild).not.toHaveBeenCalled();
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
