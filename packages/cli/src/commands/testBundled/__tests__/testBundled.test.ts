/**
 * Tests for the testBundled command - staged wiring + exit-code contract.
 *
 * Covers:
 *  - "No devices configured" path exits non-zero.
 *  - Fingerprint-unavailable path prints the test:standard fallback line and
 *    exits non-zero.
 *  - gitInfo parity: test:bundled captures git info with the SAME getGitInfo
 *    call as test:standard and forwards that exact object to openBuild.
 *
 * The SHERLO_DEVTOOLS readiness gate has been removed - staged consume-mode is
 * live (SHERLO-1707), so there is no gate to test.
 *
 * Does NOT re-test buildBundle refusal paths (HBC / RAM / version-floor) -
 * those are covered by buildBundle.test.ts. The STAGED_GATE_REFUSAL wire format
 * is covered by stagedGateRefusal.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASYNC_UPLOAD_S3_KEY_PLACEHOLDER } from '@sherlo/shared';

// ---------------------------------------------------------------------------
// Hoisted SDK-client mock handles (shared across the factory + assertions).
// ---------------------------------------------------------------------------

const { mockGetStagedUploadUrls, mockOpenBuild, mockCheckStagedGate } = vi.hoisted(() => ({
  mockGetStagedUploadUrls: vi.fn(),
  mockOpenBuild: vi.fn(),
  mockCheckStagedGate: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest above all imports)
// ---------------------------------------------------------------------------

vi.mock('@sherlo/sdk-client', () => ({
  default: vi.fn(() => ({
    checkStagedGate: mockCheckStagedGate,
    getStagedUploadUrls: mockGetStagedUploadUrls,
    openBuild: mockOpenBuild,
  })),
}));

vi.mock('../../../helpers', () => ({
  getAppBuildUrl: vi.fn(),
  getBuildRunConfig: vi.fn(),
  getGitInfo: vi.fn(),
  getPlatformsToTest: vi.fn(),
  getTokenParts: vi.fn(),
  getValidatedCommandParams: vi.fn(),
  handleClientError: vi.fn((error) => {
    throw error;
  }),
  logWarning: vi.fn(),
  printResultsUrl: vi.fn(),
  printSherloIntro: vi.fn(),
  reporting: {
    flush: vi.fn().mockResolvedValue(undefined),
    addBreadcrumb: vi.fn(),
    setTag: vi.fn(),
  },
  waitForBuildResult: vi.fn(),
}));

vi.mock('../../../helpers/fingerprint', () => ({
  computeBaseFingerprint: vi.fn(),
}));

vi.mock('../buildBundle', () => ({
  buildBundleForPlatform: vi.fn(),
  buildGateMetadata: vi.fn(),
}));

vi.mock('../uploadStagedArtifacts', () => ({
  default: vi.fn(),
}));

vi.mock('../dryRun', () => ({
  runDryRunPreview: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocked dependency accessors
// ---------------------------------------------------------------------------

import {
  getAppBuildUrl as _getAppBuildUrl,
  getBuildRunConfig as _getBuildRunConfig,
  getGitInfo as _getGitInfo,
  getPlatformsToTest as _getPlatformsToTest,
  getTokenParts as _getTokenParts,
  getValidatedCommandParams as _getValidatedCommandParams,
  printResultsUrl as _printResultsUrl,
  printSherloIntro as _printSherloIntro,
} from '../../../helpers';
import { computeBaseFingerprint as _computeBaseFingerprint } from '../../../helpers/fingerprint';
import {
  buildBundleForPlatform as _buildBundleForPlatform,
  buildGateMetadata as _buildGateMetadata,
} from '../buildBundle';
import _uploadStagedArtifacts from '../uploadStagedArtifacts';
import { runDryRunPreview as _runDryRunPreview } from '../dryRun';

const mockGetAppBuildUrl = vi.mocked(_getAppBuildUrl);
const mockGetBuildRunConfig = vi.mocked(_getBuildRunConfig);
const mockGetGitInfo = vi.mocked(_getGitInfo);
const mockGetPlatformsToTest = vi.mocked(_getPlatformsToTest);
const mockGetTokenParts = vi.mocked(_getTokenParts);
const mockGetValidatedCommandParams = vi.mocked(_getValidatedCommandParams);
const mockPrintResultsUrl = vi.mocked(_printResultsUrl);
const mockPrintSherloIntro = vi.mocked(_printSherloIntro);
const mockComputeBaseFingerprint = vi.mocked(_computeBaseFingerprint);
const mockBuildBundleForPlatform = vi.mocked(_buildBundleForPlatform);
const mockBuildGateMetadata = vi.mocked(_buildGateMetadata);
const mockUploadStagedArtifacts = vi.mocked(_uploadStagedArtifacts);
const mockRunDryRunPreview = vi.mocked(_runDryRunPreview);

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

let testBundled: (passedOptions: any) => Promise<{ url: string }>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockPrintSherloIntro.mockImplementation(() => {});
  const mod = await import('../testBundled');
  testBundled = mod.default;
});

function mockOptions(): any {
  return {};
}

const IOS_DEVICE = {
  id: 'test-iphone',
  osVersion: '17.0',
  theme: 'light',
  locale: 'en',
  fontScale: '1.0',
};

function bundleResult(overrides: Record<string, unknown> = {}): any {
  return {
    bundlePath: '/tmp/bundle.ios.js',
    bundleFormat: 'plain-js',
    bundleSizeMb: 1.5,
    bundleHash: 'abc123',
    assetsDest: undefined,
    assetInventory: [],
    bundler: 'expo',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// No devices configured - exit non-zero
// ---------------------------------------------------------------------------

describe('no devices configured', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });

    mockGetValidatedCommandParams.mockReturnValue({
      projectRoot: '/tmp/test-project',
      devices: [],
    } as any);
    mockGetPlatformsToTest.mockReturnValue([] as any);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('exits non-zero and prints guidance when no devices are configured', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(testBundled(mockOptions())).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const allCalls = logSpy.mock.calls.map((c) => c.join(' '));
    expect(allCalls.some((call) => call.includes('No devices configured'))).toBe(true);

    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Fingerprint unavailable - exit non-zero
// ---------------------------------------------------------------------------

describe('fingerprint unavailable', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });

    mockGetValidatedCommandParams.mockReturnValue({
      projectRoot: '/tmp/test-project',
      devices: [IOS_DEVICE],
    } as any);
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('prints the test:standard fallback line and exits non-zero', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockComputeBaseFingerprint.mockResolvedValue({
      hash: '',
      debugMessage: 'No base binary found',
    } as any);

    await expect(testBundled(mockOptions())).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const allCalls = logSpy.mock.calls.map((c) => c.join(' '));
    expect(allCalls.some((call) => call.includes('test:standard'))).toBe(true);
    expect(allCalls.some((call) => call.includes('Staged upload unavailable'))).toBe(true);

    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// gitInfo parity - identical to test:standard
// ---------------------------------------------------------------------------

describe('gitInfo parity with test:standard', () => {
  // A sentinel object we can assert identity on: whatever getGitInfo returns
  // must be forwarded verbatim to openBuild.
  const GIT_INFO = {
    commitName: 'feat: x',
    commitHash: 'deadbeef',
    branchName: 'my-branch',
    isDirty: false,
  };

  beforeEach(() => {
    mockGetValidatedCommandParams.mockReturnValue({
      projectRoot: '/proj',
      token: 'token-value',
      devices: [IOS_DEVICE],
      gitBranch: 'flag-branch',
      message: 'a message',
      wait: false,
    } as any);
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
    mockComputeBaseFingerprint.mockResolvedValue({ hash: 'BASE_FP' } as any);
    // Gate says fast so the happy path proceeds to upload + openBuild.
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });
    mockBuildBundleForPlatform.mockResolvedValue(bundleResult());
    mockBuildGateMetadata.mockResolvedValue({ engineClass: 'hermes' } as any);
    mockGetTokenParts.mockReturnValue({
      apiToken: 'api',
      projectIndex: 3,
      teamId: 'team',
    });
    mockGetStagedUploadUrls.mockResolvedValue({
      stagedPresignedUploadUrls: {
        ios: {
          jsBundle: { s3Key: 'js-s3-key', url: 'http://s3/js' },
          assets: { s3Key: 'assets-s3-key', url: 'http://s3/assets' },
        },
      },
    });
    mockUploadStagedArtifacts.mockResolvedValue({ jsBundleS3Key: 'js-s3-key' });
    mockGetBuildRunConfig.mockReturnValue({
      ios: { devices: [], s3Key: 'unset' },
    } as any);
    mockGetGitInfo.mockResolvedValue(GIT_INFO as any);
    mockOpenBuild.mockResolvedValue({ build: { index: 7 } });
    mockGetAppBuildUrl.mockReturnValue('http://app/build?x=1');
    mockPrintResultsUrl.mockImplementation(() => {});
  });

  it('calls getGitInfo with projectRoot + branchOverride (same signature as test:standard)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await testBundled(mockOptions());

    expect(mockGetGitInfo).toHaveBeenCalledTimes(1);
    expect(mockGetGitInfo).toHaveBeenCalledWith('/proj', { branchOverride: 'flag-branch' });

    logSpy.mockRestore();
  });

  it('forwards the exact getGitInfo result to openBuild (verbatim - no reshaping)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await testBundled(mockOptions());

    expect(mockOpenBuild).toHaveBeenCalledTimes(1);
    const openBuildArg = mockOpenBuild.mock.calls[0][0];
    // Identity check: parity means the SAME object test:standard would send.
    expect(openBuildArg.gitInfo).toBe(GIT_INFO);
    expect(openBuildArg.baseFingerprint).toBe('BASE_FP');
    expect(openBuildArg.gateMetadata.ios).toEqual({ engineClass: 'hermes' });
    expect(result).toEqual({ url: 'http://app/build?x=1' });

    logSpy.mockRestore();
  });

  it('mirrors the staged S3 keys + placeholder onto the per-platform build config', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await testBundled(mockOptions());

    const openBuildArg = mockOpenBuild.mock.calls[0][0];
    expect(openBuildArg.buildRunConfig.ios.s3Key).toBe(ASYNC_UPLOAD_S3_KEY_PLACEHOLDER);
    expect(openBuildArg.buildRunConfig.ios.jsBundleS3Key).toBe('js-s3-key');
    expect(openBuildArg.buildRunConfig.ios.bundleSizeMb).toBe(1.5);
    // No assets produced (assetsDest undefined) -> no assetsS3Key.
    expect(openBuildArg.buildRunConfig.ios.assetsS3Key).toBeUndefined();

    logSpy.mockRestore();
  });

  // SHERLO-1894: the manifest S3 key rides onto the platform config ONLY when the
  // upload produced one. Absent -> nothing extra is sent (old-API / bail-open).
  it('mirrors manifestS3Key onto the build config when the manifest was uploaded', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockUploadStagedArtifacts.mockResolvedValue({
      jsBundleS3Key: 'js-s3-key',
      manifestS3Key: 'manifest-s3-key',
    });

    await testBundled(mockOptions());

    const openBuildArg = mockOpenBuild.mock.calls[0][0];
    expect(openBuildArg.buildRunConfig.ios.manifestS3Key).toBe('manifest-s3-key');

    logSpy.mockRestore();
  });

  it('does NOT set manifestS3Key when no manifest was uploaded (bail-open, nothing extra sent)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockUploadStagedArtifacts.mockResolvedValue({ jsBundleS3Key: 'js-s3-key' });

    await testBundled(mockOptions());

    const openBuildArg = mockOpenBuild.mock.calls[0][0];
    expect('manifestS3Key' in openBuildArg.buildRunConfig.ios).toBe(false);

    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// --dry-run: preview only, creates nothing (SHERLO-1895 Phase C)
// ---------------------------------------------------------------------------

describe('--dry-run', () => {
  beforeEach(() => {
    mockGetValidatedCommandParams.mockReturnValue({
      projectRoot: '/proj',
      token: 'token-value',
      devices: [IOS_DEVICE],
    } as any);
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
    mockComputeBaseFingerprint.mockResolvedValue({ hash: 'BASE_FP' } as any);
    mockBuildBundleForPlatform.mockResolvedValue(bundleResult());
    mockBuildGateMetadata.mockResolvedValue({ engineClass: 'hermes' } as any);
    mockGetTokenParts.mockReturnValue({ apiToken: 'api', projectIndex: 3, teamId: 'team' });
    mockRunDryRunPreview.mockResolvedValue(undefined);
  });

  it('runs the preview and creates NO build: no gate check, no upload, no openBuild', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await testBundled({ dryRun: true });

    expect(mockRunDryRunPreview).toHaveBeenCalledTimes(1);
    const arg = mockRunDryRunPreview.mock.calls[0][0];
    expect(arg.platformsToTest).toEqual(['ios']);
    expect(arg.projectIndex).toBe(3);
    expect(arg.teamId).toBe('team');
    expect(arg.bundles.ios).toBeDefined();

    // The whole build-creating pipeline is skipped.
    expect(mockCheckStagedGate).not.toHaveBeenCalled();
    expect(mockGetStagedUploadUrls).not.toHaveBeenCalled();
    expect(mockUploadStagedArtifacts).not.toHaveBeenCalled();
    expect(mockOpenBuild).not.toHaveBeenCalled();

    expect(result).toEqual({ url: '' });

    logSpy.mockRestore();
  });

  it('bundles via the SAME real path (buildBundleForPlatform) before previewing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await testBundled({ dryRun: true });

    // The manifest comes from the real bundle path, not a synthetic one.
    expect(mockBuildBundleForPlatform).toHaveBeenCalledTimes(1);
    expect(mockBuildBundleForPlatform).toHaveBeenCalledWith({
      projectRoot: '/proj',
      platform: 'ios',
    });

    logSpy.mockRestore();
  });

  // A missing base fingerprint hard-fails a real staged run, but for a preview it
  // is a staged-only concern: the dry run proceeds and still produces its preview.
  it('does NOT hard-fail on a missing base fingerprint (staged-only concern)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });
    mockComputeBaseFingerprint.mockResolvedValue({
      hash: '',
      debugMessage: 'No base binary found',
    } as any);

    const result = await testBundled({ dryRun: true });

    expect(mockRunDryRunPreview).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ url: '' });

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});
