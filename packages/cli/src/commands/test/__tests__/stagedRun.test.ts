/**
 * Tests for the staged road of `sherlo test` - staged wiring + capture-plan
 * output.
 *
 * Covers:
 *  - "No devices configured" is a TOOL ERROR, not a routing answer: it exits
 *    non-zero and publishes no `native-needed` key.
 *  - gitInfo parity: the staged road captures git info with the SAME getGitInfo
 *    call as the standard road and forwards that exact object to openBuild.
 *  - the capture plan + closer, and the server-bypassed build's closer.
 *
 * The ROUTING outcomes themselves (which decision publishes which key, and with
 * which exit code) live in ./stagedRouting.test.ts.
 *
 * The SHERLO_DEVTOOLS readiness gate has been removed - staged consume-mode is
 * live (SHERLO-1707), so there is no gate to test.
 *
 * Does NOT re-test buildBundle refusal paths (HBC / RAM / version-floor) -
 * those are covered by buildBundle.test.ts. The STAGED_GATE_REFUSAL wire format
 * is covered by stagedGateRefusal.test.ts.
 */
import chalk from 'chalk';
chalk.level = 0;

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASYNC_UPLOAD_S3_KEY_PLACEHOLDER } from '@sherlo/shared';
import { keysTheApiRejects } from '../../../helpers/__tests__/openBuildPlatformConfigKeys';

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

// describeDiffSources stays REAL - the routing reason the command publishes is
// built from it, and it is pure. Only the IO-bound helpers are stubbed.
vi.mock('../../../helpers', async () => {
  const stagedGate = await vi.importActual<typeof import('../../../helpers/stagedGate')>(
    '../../../helpers/stagedGate'
  );

  return {
    describeDiffSources: stagedGate.describeDiffSources,
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
    throwError: vi.fn(({ message }: { message: string }) => {
      throw new Error(message);
    }),
    waitForBuildResult: vi.fn(),
  };
});

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

// stagedRun imports isServerBypassed / printServerBypassCloser / the network
// fetchServerBypassReason directly from the waitForBuildResult module. Keep the
// pure helpers real (so bypass detection + the closer text are exercised for
// real) and mock ONLY the network read, so tests control the reason without
// hitting the API.
vi.mock('../../../helpers/waitForBuildResult', async (importActual) => {
  const actual = await importActual<typeof import('../../../helpers/waitForBuildResult')>();
  return { ...actual, fetchServerBypassReason: vi.fn() };
});

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
  waitForBuildResult as _waitForBuildResult,
} from '../../../helpers';
import { computeBaseFingerprint as _computeBaseFingerprint } from '../../../helpers/fingerprint';
import {
  buildBundleForPlatform as _buildBundleForPlatform,
  buildGateMetadata as _buildGateMetadata,
} from '../buildBundle';
import _uploadStagedArtifacts from '../uploadStagedArtifacts';
import { runDryRunPreview as _runDryRunPreview } from '../dryRun';
import { fetchServerBypassReason as _fetchServerBypassReason } from '../../../helpers/waitForBuildResult';

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
const mockWaitForBuildResult = vi.mocked(_waitForBuildResult);
const mockFetchServerBypassReason = vi.mocked(_fetchServerBypassReason);

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

let stagedRun: (passedOptions: any) => Promise<{ url: string }>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockPrintSherloIntro.mockImplementation(() => {});
  const mod = await import('../stagedRun');
  stagedRun = mod.default;
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
// No devices configured - a TOOL ERROR, not a routing answer. Building natively
// would not make this project testable either, so the command must NOT tell a
// caller to go build: it exits non-zero and publishes no routing key at all.
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

    await expect(stagedRun(mockOptions())).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const allCalls = logSpy.mock.calls.map((c) => c.join(' '));
    expect(allCalls.some((call) => call.includes('No devices configured'))).toBe(true);
    // No routing key printed at all - there is nothing to route to.
    expect(allCalls.some((call) => call.includes('native-needed'))).toBe(false);

    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// gitInfo parity - identical to the standard road
// ---------------------------------------------------------------------------

describe('gitInfo parity with the standard road', () => {
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

  it('calls getGitInfo with projectRoot + branchOverride (same signature as the standard road)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await stagedRun(mockOptions());

    expect(mockGetGitInfo).toHaveBeenCalledTimes(1);
    expect(mockGetGitInfo).toHaveBeenCalledWith('/proj', { branchOverride: 'flag-branch' });

    logSpy.mockRestore();
  });

  it('forwards the exact getGitInfo result to openBuild (verbatim - no reshaping)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await stagedRun(mockOptions());

    expect(mockOpenBuild).toHaveBeenCalledTimes(1);
    const openBuildArg = mockOpenBuild.mock.calls[0][0];
    // Identity check: parity means the SAME object the standard road would send.
    expect(openBuildArg.gitInfo).toBe(GIT_INFO);
    expect(openBuildArg.baseFingerprint).toBe('BASE_FP');
    expect(openBuildArg.gateMetadata.ios).toEqual({ engineClass: 'hermes' });
    expect(result).toEqual({ url: 'http://app/build?x=1' });

    logSpy.mockRestore();
  });

  it('mirrors the staged S3 keys + placeholder onto the per-platform build config', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await stagedRun(mockOptions());

    const openBuildArg = mockOpenBuild.mock.calls[0][0];
    expect(openBuildArg.buildRunConfig.ios.s3Key).toBe(ASYNC_UPLOAD_S3_KEY_PLACEHOLDER);
    expect(openBuildArg.buildRunConfig.ios.jsBundleS3Key).toBe('js-s3-key');
    expect(openBuildArg.buildRunConfig.ios.bundleSizeMb).toBe(1.5);
    // No assets produced (assetsDest undefined) -> no assetsS3Key.
    expect(openBuildArg.buildRunConfig.ios.assetsS3Key).toBeUndefined();

    logSpy.mockRestore();
  });

  it('sends ONLY the fields BuildRunConfigPlatformInput accepts on the platform config', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await stagedRun(mockOptions());

    const { ios } = mockOpenBuild.mock.calls[0][0].buildRunConfig;
    expect(keysTheApiRejects(ios)).toEqual([]);
    // The server stamps baseReference from the top-level baseFingerprint; the
    // CLI must never send it (the api rejects the whole openBuild if it does).
    expect(ios).not.toHaveProperty('baseReference');

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

    await stagedRun(mockOptions());

    const openBuildArg = mockOpenBuild.mock.calls[0][0];
    expect(openBuildArg.buildRunConfig.ios.manifestS3Key).toBe('manifest-s3-key');

    logSpy.mockRestore();
  });

  it('does NOT set manifestS3Key when no manifest was uploaded (bail-open, nothing extra sent)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockUploadStagedArtifacts.mockResolvedValue({ jsBundleS3Key: 'js-s3-key' });

    await stagedRun(mockOptions());

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

    const result = await stagedRun({ dryRun: true });

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

    await stagedRun({ dryRun: true });

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

    const result = await stagedRun({ dryRun: true });

    expect(mockRunDryRunPreview).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ url: '' });

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Live capture plan (SHERLO-1919): the command EXPLAINS its own decision, then
// closes with the Review URL LAST (SHERLO-1937: no "Build created" line).
// ---------------------------------------------------------------------------

describe('live capture plan', () => {
  const ANDROID_DEVICE = { ...IOS_DEVICE, id: 'test-pixel' };

  /** A module manifest whose story-closure count is `storyCount` (the "M"). */
  function manifest(storyCount: number): any {
    const storyClosures: Record<string, unknown> = {};
    for (let i = 0; i < storyCount; i++) storyClosures[`story-${i}`] = {};
    return {
      raw: Buffer.from('{"v":1}'),
      parsed: { version: 1, header: {}, moduleHashes: {}, storyClosures },
    };
  }

  /** Wire up every mock for a live run; per-test overrides refine from here. */
  function setup({
    platforms = ['ios'],
    include,
    storyCount = 22,
    openBuildReturn,
  }: {
    platforms?: Array<'ios' | 'android'>;
    include?: string[];
    storyCount?: number;
    openBuildReturn: any;
  }): void {
    mockGetValidatedCommandParams.mockReturnValue({
      projectRoot: '/proj',
      token: 'token-value',
      devices: platforms.map((p) => (p === 'ios' ? IOS_DEVICE : ANDROID_DEVICE)),
      wait: false,
    } as any);
    mockGetPlatformsToTest.mockReturnValue(platforms as any);
    mockComputeBaseFingerprint.mockResolvedValue({ hash: 'BASE_FP' } as any);
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });
    mockBuildBundleForPlatform.mockResolvedValue(
      bundleResult({ moduleManifest: manifest(storyCount) })
    );
    mockBuildGateMetadata.mockResolvedValue({ engineClass: 'hermes' } as any);
    mockGetTokenParts.mockReturnValue({ apiToken: 'api', projectIndex: 3, teamId: 'team' });
    mockGetStagedUploadUrls.mockResolvedValue({
      stagedPresignedUploadUrls: Object.fromEntries(
        platforms.map((p) => [p, { jsBundle: { s3Key: `js-${p}`, url: `http://s3/${p}` } }])
      ),
    });
    mockUploadStagedArtifacts.mockResolvedValue({ jsBundleS3Key: 'js-key' });
    mockGetBuildRunConfig.mockReturnValue(
      Object.fromEntries(platforms.map((p) => [p, { devices: [], s3Key: 'unset' }])) as any
    );
    if (include) {
      mockGetBuildRunConfig.mockReturnValue({
        include,
        ...Object.fromEntries(platforms.map((p) => [p, { devices: [], s3Key: 'unset' }])),
      } as any);
    }
    mockGetGitInfo.mockResolvedValue({ commitHash: 'c', branchName: 'b', commitName: 'm' } as any);
    mockOpenBuild.mockResolvedValue(openBuildReturn);
    mockGetAppBuildUrl.mockReturnValue('http://app/build');
  }

  function printed(logSpy: ReturnType<typeof vi.spyOn>): string {
    return logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  it('Case 2: partial capture WITH a per-platform reason - fraction, reuse clause, list, why', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      storyCount: 22,
      openBuildReturn: {
        build: {
          index: 7,
          diffScopeInfo: {
            isFullCapture: false,
            platforms: { ios: { reason: 'SharedButton.tsx changed' } },
          },
        },
        buildRun: {
          config: {
            ios: {
              devices: [],
              captureScope: {
                full: false,
                storyFilePaths: [
                  'src/components/Storefront/Storefront.stories.tsx',
                  'src/components/Cart/Cart.stories.tsx',
                ],
              },
            },
          },
        },
      },
    });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('📸 Capture plan');
    expect(out).toContain(
      '🍎 iOS - capturing 2 of 22 stories in this bundle, reusing 20 from the previous build'
    );
    expect(out).toContain('     why: SharedButton.tsx changed');
    expect(out).toContain('     stories:');
    expect(out).toContain('       • Storefront/Storefront');
    expect(out).toContain('       • Cart/Cart');

    logSpy.mockRestore();
  });

  it('Case 4: full capture, taking the reason from fullCaptureTriggerReason (ladder rung 2)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      openBuildReturn: {
        build: {
          index: 7,
          diffScopeInfo: {
            isFullCapture: true,
            fullCaptureTriggerReason: 'native code changed - everything re-shot',
          },
        },
        buildRun: {
          config: { ios: { devices: [], captureScope: { full: true, storyFilePaths: [] } } },
        },
      },
    });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('🍎 iOS - capturing all 22 stories in this bundle');
    expect(out).toContain('     why: native code changed - everything re-shot');
    // Inversion: an empty list on a full capture is "everything", never "nothing".
    expect(out).not.toContain('capturing 0');
    expect(out).not.toContain('nothing');

    logSpy.mockRestore();
  });

  it('Case 3: nothing to capture - the whole bundle reused, no "Build created" closer', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      storyCount: 22,
      openBuildReturn: {
        build: {
          index: 7,
          diffScopeInfo: {
            isFullCapture: false,
            platforms: { ios: { reason: 'no change reaches any story' } },
          },
        },
        buildRun: {
          config: { ios: { devices: [], captureScope: { full: false, storyFilePaths: [] } } },
        },
      },
    });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('🍎 iOS - nothing to capture - no change reaches any story');
    expect(out).toContain('     ✓ all 22 stories reused from the previous build');
    // No "Build created" line (SHERLO-1937) - the Review URL is the ending.
    expect(out).not.toContain('Build created');
    expect(out).toContain('🔗 Review: http://app/build');
    expect(out).not.toContain('running on devices');

    logSpy.mockRestore();
  });

  it('Case 7: full capture with NO reason degrades to the "couldn\'t compute" safety row', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      storyCount: 22,
      openBuildReturn: {
        // Full capture recorded, but no reason available (older server / degraded).
        build: { index: 7, diffScopeInfo: { isFullCapture: true } },
        buildRun: {
          config: { ios: { devices: [], captureScope: { full: true, storyFilePaths: [] } } },
        },
      },
    });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('🍎 iOS - capturing all 22 stories in this bundle');
    expect(out).toContain("     ! couldn't compute what changed - capturing everything to be safe");
    expect(out).not.toContain('why:');

    logSpy.mockRestore();
  });

  it('renders a partial WITHOUT a reason (forward-compat degrade): counts + list, no why line', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      storyCount: 8,
      openBuildReturn: {
        // diffScopeInfo has NO per-platform reason yet (api PR not landed), and this
        // is not a full capture, so the why line is omitted entirely.
        build: { index: 7, diffScopeInfo: { isFullCapture: false } },
        buildRun: {
          config: {
            ios: {
              devices: [],
              captureScope: {
                full: false,
                storyFilePaths: ['src/components/x/X.stories.tsx'],
              },
            },
          },
        },
      },
    });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain(
      '🍎 iOS - capturing 1 of 8 stories in this bundle, reusing 7 from the previous build'
    );
    expect(out).toContain('       • x/X');
    // The block renders in full; it simply carries no why line.
    expect(out).not.toContain('why:');

    logSpy.mockRestore();
  });

  it('prints NO plan block when captureScope is absent, but still closes with the URL', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      openBuildReturn: {
        build: { index: 7 },
        buildRun: { config: { ios: { devices: [] } } }, // no captureScope
      },
    });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    // No plan: no header, no per-platform block, no assertion of a decision.
    expect(out).not.toContain('Capture plan');
    expect(out).not.toContain('capturing');
    // No "Build created" line (SHERLO-1937) - the link is never withheld though.
    expect(out).not.toContain('Build created');
    expect(out).not.toContain('running on devices');
    expect(out).toContain('🔗 Review: http://app/build');

    logSpy.mockRestore();
  });

  it('Case 5: platforms disagree - one partial captures, one reuses everything', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      platforms: ['ios', 'android'],
      storyCount: 22,
      openBuildReturn: {
        build: {
          index: 7,
          diffScopeInfo: {
            isFullCapture: false,
            platforms: {
              ios: { reason: 'ProductCardPlatformNote.ios.tsx changed' },
              android: { reason: 'the change never reaches the Android app' },
            },
          },
        },
        buildRun: {
          config: {
            ios: {
              devices: [],
              captureScope: {
                full: false,
                storyFilePaths: ['src/components/Storefront/ProductCard.stories.tsx'],
              },
            },
            android: { devices: [], captureScope: { full: false, storyFilePaths: [] } },
          },
        },
      },
    });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain(
      '🍎 iOS - capturing 1 of 22 stories in this bundle, reusing 21 from the previous build'
    );
    expect(out).toContain('     why: ProductCardPlatformNote.ios.tsx changed');
    expect(out).toContain('       • Storefront/ProductCard');
    expect(out).toContain(
      '🤖 Android - nothing to capture - the change never reaches the Android app'
    );
    expect(out).toContain('     ✓ all 22 stories reused from the previous build');
    // No "Build created" line (SHERLO-1937) - even though iOS captured a story,
    // there is no "- running on devices" suffix either.
    expect(out).not.toContain('Build created');
    expect(out).not.toContain('running on devices');

    logSpy.mockRestore();
  });

  // ORDERING: the Review URL prints LAST - after the capture plan, never before
  // it (SHERLO-1919 ordering change; SHERLO-1937 dropped the "Build created" line
  // that used to sit between the plan and the URL).
  it('prints the Review URL LAST, after the capture plan, with no "Build created" line', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      storyCount: 22,
      openBuildReturn: {
        build: {
          index: 7,
          diffScopeInfo: { isFullCapture: false, platforms: { ios: { reason: 'x changed' } } },
        },
        buildRun: {
          config: {
            ios: {
              devices: [],
              captureScope: { full: false, storyFilePaths: ['src/components/x/X.stories.tsx'] },
            },
          },
        },
      },
    });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    const planIdx = out.indexOf('📸 Capture plan');
    const urlIdx = out.indexOf('🔗 Review:');
    expect(planIdx).toBeGreaterThanOrEqual(0);
    expect(urlIdx).toBeGreaterThan(planIdx);
    expect(out).not.toContain('Build created');

    logSpy.mockRestore();
  });

  it('renders a mix: one full platform, one partial platform', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      platforms: ['ios', 'android'],
      storyCount: 10,
      openBuildReturn: {
        build: {
          index: 7,
          diffScopeInfo: {
            isFullCapture: false,
            fullCaptureTriggerReason: 'native-changed',
            platforms: { android: { reason: 'x.tsx changed' } },
          },
        },
        buildRun: {
          config: {
            ios: { devices: [], captureScope: { full: true, storyFilePaths: [] } },
            android: {
              devices: [],
              captureScope: { full: false, storyFilePaths: ['src/components/x/X.stories.tsx'] },
            },
          },
        },
      },
    });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('🍎 iOS - capturing all 10 stories in this bundle');
    expect(out).toContain('     why: native-changed');
    expect(out).toContain(
      '🤖 Android - capturing 1 of 10 stories in this bundle, reusing 9 from the previous build'
    );
    expect(out).toContain('       • x/X');
    expect(out).toContain('     why: x.tsx changed');

    logSpy.mockRestore();
  });

  // The fraction is MANIFEST-denominated, so --include never moves it. Same M,
  // same "2 of 22" label, whether include is unset, matches a subset, or nothing.
  it.each([
    ['no --include', undefined],
    ['--include matching a subset', ['Sanity', 'Storefront']],
    ['--include matching nothing', ['DoesNotExist']],
  ])('the fraction is unchanged by %s (--include invariant)', async (_name, include) => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      include: include as string[] | undefined,
      storyCount: 22,
      openBuildReturn: {
        build: { index: 7, diffScopeInfo: { isFullCapture: false } },
        buildRun: {
          config: {
            ios: {
              devices: [],
              captureScope: {
                full: false,
                storyFilePaths: [
                  'src/components/a/A.stories.tsx',
                  'src/components/b/B.stories.tsx',
                ],
              },
            },
          },
        },
      },
    });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    // The exact fraction is pinned so the invariant is stated, not inferred.
    expect(out).toContain(
      '🍎 iOS - capturing 2 of 22 stories in this bundle, reusing 20 from the previous build'
    );

    logSpy.mockRestore();
  });

  // DISPLAY ONLY. The openBuild request (the decision inputs) must not move
  // because the response now carries a diff-scope decision.
  it('does NOT alter the openBuild request or the buildRunConfig when printing the plan', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      openBuildReturn: {
        build: {
          index: 7,
          diffScopeInfo: { isFullCapture: false, platforms: { ios: { reason: 'x changed' } } },
        },
        buildRun: {
          config: {
            ios: {
              devices: [],
              captureScope: { full: false, storyFilePaths: ['src/components/x/X.stories.tsx'] },
            },
          },
        },
      },
    });

    await stagedRun(mockOptions());

    const openBuildArg = mockOpenBuild.mock.calls[0][0];
    // Nothing about the decision inputs moved: no diff-scope field is sent, and the
    // request carries only the staged wiring it always did.
    expect('captureScope' in openBuildArg.buildRunConfig.ios).toBe(false);
    expect('diffScopeInfo' in openBuildArg).toBe(false);
    expect(openBuildArg.buildRunConfig.ios.s3Key).toBe(ASYNC_UPLOAD_S3_KEY_PLACEHOLDER);
    expect(openBuildArg.buildRunConfig.ios.jsBundleS3Key).toBe('js-key');

    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Server-bypassed build (SHERLO-1952): the API closed the build itself without a
// device run (0 captured, >0 inherited). The CLI must stop pointing at the
// review page (SHERLO-1974) and stop implying device work happened, in BOTH
// modes. Detection is off the openBuild COUNTS. In --wait mode the compact closer
// comes from the poll (waitForBuildResult, mocked here). In non-wait mode it
// comes from a single guarded getBuildStatus read (fetchServerBypassReason,
// mocked here); if that read yields no reason the CLI falls back to today's
// Review URL - a working link beats silence.
// ---------------------------------------------------------------------------

describe('server-bypassed build (SHERLO-1952)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  /**
   * Wire a run whose openBuild response reports the given diffScopeInfo counts.
   * `wait` toggles --wait; `bypassed` picks the count shape (0/>0 vs a normal
   * partial capture).
   */
  function setup({ wait, bypassed }: { wait: boolean; bypassed: boolean }): void {
    mockGetValidatedCommandParams.mockReturnValue({
      projectRoot: '/proj',
      token: 'token-value',
      devices: [IOS_DEVICE],
      wait,
      waitTimeout: undefined,
    } as any);
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
    mockComputeBaseFingerprint.mockResolvedValue({ hash: 'BASE_FP' } as any);
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });
    mockBuildBundleForPlatform.mockResolvedValue(bundleResult());
    mockBuildGateMetadata.mockResolvedValue({ engineClass: 'hermes' } as any);
    mockGetTokenParts.mockReturnValue({ apiToken: 'api', projectIndex: 3, teamId: 'team' });
    mockGetStagedUploadUrls.mockResolvedValue({
      stagedPresignedUploadUrls: { ios: { jsBundle: { s3Key: 'js', url: 'http://s3/js' } } },
    });
    mockUploadStagedArtifacts.mockResolvedValue({ jsBundleS3Key: 'js' });
    mockGetBuildRunConfig.mockReturnValue({ ios: { devices: [], s3Key: 'unset' } } as any);
    mockGetGitInfo.mockResolvedValue({ commitHash: 'c', branchName: 'b', commitName: 'm' } as any);
    mockGetAppBuildUrl.mockReturnValue('http://app/build');
    mockWaitForBuildResult.mockResolvedValue(0);

    const diffScopeInfo = bypassed
      ? { capturedSnapshotCount: 0, inheritedSnapshotCount: 12 }
      : { capturedSnapshotCount: 3, inheritedSnapshotCount: 9 };

    mockOpenBuild.mockResolvedValue({
      build: { index: 7, diffScopeInfo },
      // No captureScope -> no plan block; keeps these tests focused on the closer.
      buildRun: { config: { ios: { devices: [] } } },
    });
  }

  function printed(logSpy: ReturnType<typeof vi.spyOn>): string {
    return logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  beforeEach(() => {
    // --wait exits the process with the code; make that inert so the test can
    // inspect what was printed and how waitForBuildResult was called.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('--wait: withholds the Review URL, makes NO non-wait read, flags the bypass to the poll', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({ wait: true, bypassed: true });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    // No review URL here - the --wait poll's closer speaks for the build instead.
    expect(out).not.toContain('🔗 Review');
    expect(out).not.toContain('http://app/build');

    expect(mockWaitForBuildResult).toHaveBeenCalledTimes(1);
    expect(mockWaitForBuildResult.mock.calls[0][0]).toMatchObject({ serverBypassed: true });
    // The non-wait single read is exclusive to the non-wait path.
    expect(mockFetchServerBypassReason).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('NON-wait: prints the compact closer with the verbatim reason and NO Review URL', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({ wait: false, bypassed: true });
    mockFetchServerBypassReason.mockResolvedValue('no change reaches any story');

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('✅ Nothing needed capturing - no change reaches any story');
    expect(out).toContain('closed by the server - no device run was needed');
    // The whole point: no URL of any kind on the bypassed path.
    expect(out).not.toContain('🔗 Review');
    expect(out).not.toContain('http://app/build');

    // One getBuildStatus read against the already-closed build; no polling.
    expect(mockWaitForBuildResult).not.toHaveBeenCalled();
    expect(mockFetchServerBypassReason).toHaveBeenCalledTimes(1);
    expect(mockFetchServerBypassReason.mock.calls[0][0]).toMatchObject({
      token: 'token-value',
      buildIndex: 7,
      projectIndex: 3,
      teamId: 'team',
    });

    logSpy.mockRestore();
  });

  it('NON-wait fallback: reason unavailable -> keeps the Review URL, never a bare closer', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({ wait: false, bypassed: true });
    // The read degraded (network / older API / no per-platform prose).
    mockFetchServerBypassReason.mockResolvedValue(undefined);

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    // A working link beats silence; a closer never prints with nothing after the dash.
    expect(out).toContain('🔗 Review: http://app/build');
    expect(out).not.toContain('Nothing needed capturing');

    logSpy.mockRestore();
  });

  it('non-bypassed --wait: Review URL prints, serverBypassed=false, ZERO extra reads', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({ wait: true, bypassed: false });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('🔗 Review: http://app/build');

    expect(mockWaitForBuildResult).toHaveBeenCalledTimes(1);
    expect(mockWaitForBuildResult.mock.calls[0][0]).toMatchObject({ serverBypassed: false });
    // Guard rail 1: a normal build makes NO extra call.
    expect(mockFetchServerBypassReason).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('non-bypassed NON-wait: Review URL prints and makes ZERO extra reads', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({ wait: false, bypassed: false });

    await stagedRun(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('🔗 Review: http://app/build');
    expect(mockFetchServerBypassReason).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('NON-wait bypassed output is pinned', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({ wait: false, bypassed: true });
    mockFetchServerBypassReason.mockResolvedValue('no change reaches any story');

    await stagedRun(mockOptions());

    expect(printed(logSpy)).toMatchSnapshot();

    logSpy.mockRestore();
  });

  // BYTE-IDENTICAL guarantee (explicit acceptance criterion): a non-bypassed
  // build's own printed output is unchanged, and identical whether or not --wait
  // is set (the wait poll adds nothing to stagedRun's own output here).
  it('non-bypassed output is byte-identical with and without --wait', async () => {
    const logA = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({ wait: false, bypassed: false });
    await stagedRun(mockOptions());
    const withoutWait = printed(logA);
    logA.mockRestore();

    vi.clearAllMocks();

    const logB = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({ wait: true, bypassed: false });
    await stagedRun(mockOptions());
    const withWait = printed(logB);
    logB.mockRestore();

    expect(withWait).toBe(withoutWait);
    expect(withoutWait).toMatchSnapshot();
  });
});
