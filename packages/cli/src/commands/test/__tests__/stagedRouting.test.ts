/**
 * Tests for the ROUTING CONTRACT of `sherlo test`'s staged road.
 *
 * The command answers exactly one question - can this commit be tested without a
 * native rebuild? - and publishes the answer three ways that must never drift:
 * a machine-readable stdout line, the same key in $GITHUB_OUTPUT, and an exit
 * code. These tests pin all three against every outcome:
 *
 *   fast-completed   `native-needed=false`, exit 0, the run really happened.
 *   native-needed    `native-needed=true`, exit EXIT_NATIVE_NEEDED, and NOTHING
 *                     was built or uploaded on the way out.
 *   tool error       throws, and writes NO key at all - which is precisely what
 *                     lets a CI gate tell a routing decision from a crash.
 *
 * The gate is asked TWICE on a fast run: once before bundling (fingerprint only)
 * and once after (real bundle-derived identity). Either refusal is the same
 * answer, so both are pinned here.
 */
import chalk from 'chalk';
chalk.level = 0;

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetStagedUploadUrls, mockOpenBuild, mockCheckStagedGate } = vi.hoisted(() => ({
  mockGetStagedUploadUrls: vi.fn(),
  mockOpenBuild: vi.fn(),
  mockCheckStagedGate: vi.fn(),
}));

vi.mock('@sherlo/sdk-client', () => ({
  default: vi.fn(() => ({
    checkStagedGate: mockCheckStagedGate,
    getStagedUploadUrls: mockGetStagedUploadUrls,
    openBuild: mockOpenBuild,
  })),
}));

// describeDiffSources stays REAL - the published reason is built from it.
vi.mock('../../../helpers', async () => {
  const stagedGate = await vi.importActual<typeof import('../../../helpers/stagedGate')>(
    '../../../helpers/stagedGate'
  );

  return {
    describeDiffSources: stagedGate.describeDiffSources,
    getAppBuildUrl: vi.fn(() => 'http://app/build'),
    getBuildRunConfig: vi.fn(() => ({ ios: { devices: [], s3Key: 'unset' } })),
    getGitInfo: vi.fn(async () => ({ commitHash: 'c', branchName: 'b', commitName: 'm' })),
    getPlatformsToTest: vi.fn(() => ['ios']),
    getTokenParts: vi.fn(() => ({ apiToken: 'api', projectIndex: 3, teamId: 'team' })),
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
    waitForBuildResult: vi.fn(async () => 0),
    writeGithubOutput: vi.fn(),
  };
});

vi.mock('../../../helpers/fingerprint', () => ({ computeBaseFingerprint: vi.fn() }));
vi.mock('../buildBundle', () => ({
  buildBundleForPlatform: vi.fn(),
  buildGateMetadata: vi.fn(),
}));
vi.mock('../uploadStagedArtifacts', () => ({ default: vi.fn() }));
vi.mock('../dryRun', () => ({ runDryRunPreview: vi.fn() }));

import {
  getValidatedCommandParams as _getValidatedCommandParams,
  waitForBuildResult as _waitForBuildResult,
  writeGithubOutput as _writeGithubOutput,
} from '../../../helpers';
import { computeBaseFingerprint as _computeBaseFingerprint } from '../../../helpers/fingerprint';
import {
  buildBundleForPlatform as _buildBundleForPlatform,
  buildGateMetadata as _buildGateMetadata,
} from '../buildBundle';
import _uploadStagedArtifacts from '../uploadStagedArtifacts';
import { runDryRunPreview as _runDryRunPreview } from '../dryRun';
import { EXIT_NATIVE_NEEDED } from '../constants';

const mockGetValidatedCommandParams = vi.mocked(_getValidatedCommandParams);
const mockWaitForBuildResult = vi.mocked(_waitForBuildResult);
const mockWriteGithubOutput = vi.mocked(_writeGithubOutput);
const mockComputeBaseFingerprint = vi.mocked(_computeBaseFingerprint);
const mockBuildBundleForPlatform = vi.mocked(_buildBundleForPlatform);
const mockBuildGateMetadata = vi.mocked(_buildGateMetadata);
const mockUploadStagedArtifacts = vi.mocked(_uploadStagedArtifacts);
const mockRunDryRunPreview = vi.mocked(_runDryRunPreview);

let stagedRun: (passedOptions: any) => Promise<{ url: string }>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

const IOS_DEVICE = {
  id: 'test-iphone',
  osVersion: '17.0',
  theme: 'light',
  locale: 'en',
  fontScale: '1.0',
};

beforeEach(async () => {
  vi.clearAllMocks();

  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
    throw new Error(`process.exit(${code})`);
  });
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  mockGetValidatedCommandParams.mockReturnValue({
    projectRoot: '/proj',
    token: 'token-value',
    devices: [IOS_DEVICE],
    wait: false,
  } as any);
  mockComputeBaseFingerprint.mockResolvedValue({ hash: 'BASE_FP' } as any);
  mockBuildBundleForPlatform.mockResolvedValue({
    bundlePath: '/tmp/bundle.ios.js',
    bundleFormat: 'plain-js',
    bundleSizeMb: 1.5,
    bundleHash: 'abc123',
    assetInventory: [],
    bundler: 'expo',
  } as any);
  mockBuildGateMetadata.mockResolvedValue({ engineClass: 'hermes' } as any);
  mockGetStagedUploadUrls.mockResolvedValue({
    stagedPresignedUploadUrls: { ios: { jsBundle: { s3Key: 'js', url: 'http://s3/js' } } },
  });
  mockUploadStagedArtifacts.mockResolvedValue({ jsBundleS3Key: 'js' });
  mockOpenBuild.mockResolvedValue({
    build: { index: 7 },
    buildRun: { config: { ios: { devices: [] } } },
  });

  const mod = await import('../stagedRun');
  stagedRun = mod.default;
});

afterEach(() => {
  exitSpy.mockRestore();
  logSpy.mockRestore();
});

/** Everything the command printed, as one string. */
function printed(): string {
  return logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
}

/** The single $GITHUB_OUTPUT payload the command wrote. */
function githubOutput(): Record<string, unknown> {
  expect(mockWriteGithubOutput).toHaveBeenCalledTimes(1);
  return mockWriteGithubOutput.mock.calls[0][0] as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// native-needed: the gate refuses BEFORE anything is built
// ---------------------------------------------------------------------------

describe('native-needed (nothing is built)', () => {
  it.each([
    ['a native change', 'full-build-needed', ['engineClass'], 'JS engine (Hermes/JSC)'],
    ['no registered base', 'not-stageable', [], "can't use the staged fast path"],
  ])(
    'routes on %s: publishes native-needed=true and builds NOTHING',
    async (_name, outcome, diff, expectedReasonFragment) => {
      mockCheckStagedGate.mockResolvedValue({ outcome, diff });

      await expect(stagedRun({})).rejects.toThrow(`process.exit(${EXIT_NATIVE_NEEDED})`);

      // The machine-readable line, on stdout, for any CI.
      expect(printed()).toContain('native-needed=true');

      // The same answer in $GITHUB_OUTPUT, with a reason a human can read.
      const output = githubOutput();
      expect(output['native-needed']).toBe(true);
      expect(output['base-fingerprint']).toBe('BASE_FP');
      expect(String(output.reason)).toContain(expectedReasonFragment);

      // THE POINT: not one byte of work was done on the way out.
      expect(mockBuildBundleForPlatform).not.toHaveBeenCalled();
      expect(mockGetStagedUploadUrls).not.toHaveBeenCalled();
      expect(mockUploadStagedArtifacts).not.toHaveBeenCalled();
      expect(mockOpenBuild).not.toHaveBeenCalled();
    }
  );

  it('asks the pre-bundle gate with the marker-only probe payload (no fabricated identity)', async () => {
    mockCheckStagedGate.mockResolvedValue({ outcome: 'full-build-needed', diff: [] });

    await expect(stagedRun({})).rejects.toThrow(`process.exit(${EXIT_NATIVE_NEEDED})`);

    expect(mockCheckStagedGate).toHaveBeenCalledTimes(1);
    expect(mockCheckStagedGate.mock.calls[0][0]).toEqual({
      baseFingerprint: 'BASE_FP',
      gateMetadata: { derivedFrom: 'none' },
      platform: 'ios',
      projectIndex: 3,
      teamId: 'team',
    });
  });

  it('routes when the base fingerprint cannot be computed - without asking the gate', async () => {
    mockComputeBaseFingerprint.mockResolvedValue({
      hash: null,
      debugMessage: 'not a React Native project',
    } as any);

    await expect(stagedRun({})).rejects.toThrow(`process.exit(${EXIT_NATIVE_NEEDED})`);

    expect(printed()).toContain('native-needed=true');
    expect(githubOutput().reason).toBe('not a React Native project');
    expect(mockCheckStagedGate).not.toHaveBeenCalled();
    expect(mockBuildBundleForPlatform).not.toHaveBeenCalled();
  });

  it('tells the developer how to come back: the full-run fallback line', async () => {
    mockCheckStagedGate.mockResolvedValue({ outcome: 'full-build-needed', diff: ['engineClass'] });

    await expect(stagedRun({})).rejects.toThrow(`process.exit(${EXIT_NATIVE_NEEDED})`);

    expect(printed()).toContain('sherlo test --android <path> [--ios <path>]');
  });

  // The exit code sits OUTSIDE the --wait contract's range (0/1/2/3/130) so a
  // `sherlo test --wait` gate can never read "native build needed" as GREEN.
  it('--wait: still exits EXIT_NATIVE_NEEDED, never a wait code, and never polls', async () => {
    mockGetValidatedCommandParams.mockReturnValue({
      projectRoot: '/proj',
      token: 'token-value',
      devices: [IOS_DEVICE],
      wait: true,
    } as any);
    mockCheckStagedGate.mockResolvedValue({ outcome: 'full-build-needed', diff: [] });

    await expect(stagedRun({})).rejects.toThrow(`process.exit(${EXIT_NATIVE_NEEDED})`);
    expect(EXIT_NATIVE_NEEDED).not.toBe(0);
    expect(mockWaitForBuildResult).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// native-needed: the gate refuses AFTER bundling, on the real identity
// ---------------------------------------------------------------------------

describe('native-needed after bundling (real bundle identity)', () => {
  it('refuses on the post-bundle gate: nothing is uploaded and no build is opened', async () => {
    mockCheckStagedGate
      .mockResolvedValueOnce({ outcome: 'fast', diff: [] })
      .mockResolvedValueOnce({ outcome: 'full-build-needed', diff: ['bundleFormat'] });

    await expect(stagedRun({})).rejects.toThrow(`process.exit(${EXIT_NATIVE_NEEDED})`);

    // It DID bundle - that is how the real identity became knowable.
    expect(mockBuildBundleForPlatform).toHaveBeenCalledTimes(1);
    // The second ask carries the real bundle-derived metadata, not the marker.
    expect(mockCheckStagedGate.mock.calls[1][0].gateMetadata).toEqual({ engineClass: 'hermes' });

    expect(printed()).toContain('native-needed=true');
    expect(String(githubOutput().reason)).toContain('JS bundle format');
    expect(mockGetStagedUploadUrls).not.toHaveBeenCalled();
    expect(mockOpenBuild).not.toHaveBeenCalled();
  });

  it('refuses on openBuild (a base registered mid-run) with the SAME published answer', async () => {
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });
    mockOpenBuild.mockRejectedValue({
      message: 'STAGED_GATE_REFUSAL|full-build-needed|ios|assetInventory',
    });

    await expect(stagedRun({})).rejects.toThrow(`process.exit(${EXIT_NATIVE_NEEDED})`);

    expect(printed()).toContain('native-needed=true');
    expect(String(githubOutput().reason)).toContain('bundled assets');
  });
});

// ---------------------------------------------------------------------------
// fast-completed
// ---------------------------------------------------------------------------

describe('fast path ran to completion', () => {
  beforeEach(() => {
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });
  });

  it('publishes native-needed=false, opens the build, and returns the review URL', async () => {
    const result = await stagedRun({});

    expect(printed()).toContain('native-needed=false');
    const output = githubOutput();
    expect(output['native-needed']).toBe(false);
    expect(output['base-fingerprint']).toBe('BASE_FP');

    expect(mockOpenBuild).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ url: 'http://app/build' });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("publishes the answer BEFORE the run's own closer, so the URL is still last", async () => {
    await stagedRun({});

    const out = printed();
    expect(out.indexOf('native-needed=false')).toBeLessThan(out.indexOf('🔗 Review:'));
  });

  it('asks the gate twice: fingerprint first, then the real bundle identity', async () => {
    await stagedRun({});

    expect(mockCheckStagedGate).toHaveBeenCalledTimes(2);
    expect(mockCheckStagedGate.mock.calls[0][0].gateMetadata).toEqual({ derivedFrom: 'none' });
    expect(mockCheckStagedGate.mock.calls[1][0].gateMetadata).toEqual({ engineClass: 'hermes' });
  });
});

// ---------------------------------------------------------------------------
// Tool errors and previews publish NOTHING
// ---------------------------------------------------------------------------

describe('nothing is published when there is no routing decision', () => {
  it('a genuine tool error throws and writes no key (the CI discriminator)', async () => {
    mockCheckStagedGate.mockRejectedValue(new Error('Invalid token'));

    await expect(stagedRun({})).rejects.toThrow('Invalid token');

    expect(mockWriteGithubOutput).not.toHaveBeenCalled();
    expect(printed()).not.toContain('native-needed');
  });

  it('--dry-run previews without deciding anything: no gate, no key', async () => {
    mockRunDryRunPreview.mockResolvedValue(undefined);

    const result = await stagedRun({ dryRun: true });

    expect(mockRunDryRunPreview).toHaveBeenCalledTimes(1);
    expect(mockCheckStagedGate).not.toHaveBeenCalled();
    expect(mockWriteGithubOutput).not.toHaveBeenCalled();
    expect(printed()).not.toContain('native-needed');
    expect(result).toEqual({ url: '' });
  });
});
