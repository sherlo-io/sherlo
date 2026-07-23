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

// ---------------------------------------------------------------------------
// Live Diff Scope report (SHERLO-1915): the command EXPLAINS its own decision.
// ---------------------------------------------------------------------------

describe('live Diff Scope report', () => {
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
    mockPrintResultsUrl.mockImplementation(() => {});
  }

  function printed(logSpy: ReturnType<typeof vi.spyOn>): string {
    return logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  it('renders a partial capture WITH a per-platform reason: fraction, reused side, list, reason', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      storyCount: 22,
      openBuildReturn: {
        build: {
          index: 7,
          diffScopeInfo: {
            isFullCapture: false,
            platforms: {
              ios: {
                reason:
                  'captured 2 - closure changed via src/components/Storefront/SharedButton.tsx',
              },
            },
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

    await testBundled(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('📋 Diff Scope - what this run photographed');
    expect(out).toContain('🍎 iOS - captured 2 of 22 stories in this bundle');
    expect(out).toContain(
      'Reused the other 20 (already photographed on the base build, not re-shot here).'
    );
    expect(out).toContain('Stories captured:');
    expect(out).toContain('• src/components/Storefront/Storefront.stories.tsx');
    expect(out).toContain('• src/components/Cart/Cart.stories.tsx');
    expect(out).toContain(
      'Reason: captured 2 - closure changed via src/components/Storefront/SharedButton.tsx'
    );

    logSpy.mockRestore();
  });

  it('renders a full capture, taking the reason from fullCaptureTriggerReason (ladder rung 2)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      openBuildReturn: {
        build: {
          index: 7,
          diffScopeInfo: { isFullCapture: true, fullCaptureTriggerReason: 'native-changed' },
        },
        buildRun: {
          config: { ios: { devices: [], captureScope: { full: true, storyFilePaths: [] } } },
        },
      },
    });

    await testBundled(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('🍎 iOS - captured EVERY story in this bundle');
    expect(out).toContain('Reason: native-changed');
    // Inversion: an empty list on a full capture is "everything", never "nothing".
    expect(out).not.toContain('captured 0');
    expect(out).not.toContain('nothing');

    logSpy.mockRestore();
  });

  it('renders a partial WITHOUT a reason (forward-compat degrade): counts + list, no reason line', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      storyCount: 8,
      openBuildReturn: {
        // diffScopeInfo has NO per-platform reason yet (api PR not landed), and this
        // is not a full capture, so the reason line is omitted entirely.
        build: { index: 7, diffScopeInfo: { isFullCapture: false } },
        buildRun: {
          config: {
            ios: {
              devices: [],
              captureScope: { full: false, storyFilePaths: ['src/x/X.stories.tsx'] },
            },
          },
        },
      },
    });

    await testBundled(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('🍎 iOS - captured 1 of 8 stories in this bundle');
    expect(out).toContain('• src/x/X.stories.tsx');
    // The block renders in full; it simply carries no reason line.
    expect(out).not.toContain('Reason:');

    logSpy.mockRestore();
  });

  it('prints NOTHING about diff scope when captureScope is absent (Diff Scope v2 off / older API)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      openBuildReturn: {
        build: { index: 7 },
        buildRun: { config: { ios: { devices: [] } } }, // no captureScope
      },
    });

    await testBundled(mockOptions());

    const out = printed(logSpy);
    // Silence is correct: no header, no per-platform block, no assertion of a decision.
    expect(out).not.toContain('Diff Scope');
    expect(out).not.toContain('captured');

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
            platforms: { android: { reason: 'captured 1 - closure changed via src/x.tsx' } },
          },
        },
        buildRun: {
          config: {
            ios: { devices: [], captureScope: { full: true, storyFilePaths: [] } },
            android: {
              devices: [],
              captureScope: { full: false, storyFilePaths: ['src/x/X.stories.tsx'] },
            },
          },
        },
      },
    });

    await testBundled(mockOptions());

    const out = printed(logSpy);
    expect(out).toContain('🍎 iOS - captured EVERY story in this bundle');
    expect(out).toContain('Reason: native-changed');
    expect(out).toContain('🤖 Android - captured 1 of 10 stories in this bundle');
    expect(out).toContain('• src/x/X.stories.tsx');
    expect(out).toContain('Reason: captured 1 - closure changed via src/x.tsx');

    logSpy.mockRestore();
  });

  // Deliverable 5.1: the fraction is MANIFEST-denominated, so --include never moves
  // it. Same M, same "2 of 22 in this bundle" label, whether include is unset,
  // matches a subset, or matches nothing.
  it.each([
    ['no --include', undefined],
    ['--include matching a subset', ['Sanity', 'Storefront']],
    ['--include matching nothing', ['DoesNotExist']],
  ])('the fraction is unchanged by %s (tier-1 relabel invariant)', async (_name, include) => {
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
                storyFilePaths: ['src/a/A.stories.tsx', 'src/b/B.stories.tsx'],
              },
            },
          },
        },
      },
    });

    await testBundled(mockOptions());

    const out = printed(logSpy);
    // The exact label is pinned so the invariant is stated, not inferred.
    expect(out).toContain('🍎 iOS - captured 2 of 22 stories in this bundle');

    logSpy.mockRestore();
  });

  // Deliverable 5.2: this task is DISPLAY ONLY. The openBuild request (the decision
  // inputs) must not move because the response now carries a diff-scope decision.
  it('does NOT alter the openBuild request or the buildRunConfig when printing the report', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setup({
      openBuildReturn: {
        build: {
          index: 7,
          diffScopeInfo: { isFullCapture: false, platforms: { ios: { reason: 'captured 1 - x' } } },
        },
        buildRun: {
          config: {
            ios: {
              devices: [],
              captureScope: { full: false, storyFilePaths: ['src/x/X.stories.tsx'] },
            },
          },
        },
      },
    });

    await testBundled(mockOptions());

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
