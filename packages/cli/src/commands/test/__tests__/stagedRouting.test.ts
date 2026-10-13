/**
 * Tests for the staged road of `sherlo test` when the gate says "fast".
 *
 * The run prints no machine-readable routing keys, and a tool error throws and prints none
 * either. The gate is asked TWICE on a fast run: once before bundling (fingerprint only) and
 * once after (real bundle-derived identity).
 */
import chalk from 'chalk';
chalk.level = 0;

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  };
});

vi.mock('../../../helpers/fingerprint', () => ({ computeBaseFingerprint: vi.fn() }));
vi.mock('../buildBundle', () => ({
  buildBundleForPlatform: vi.fn(),
  buildGateMetadata: vi.fn(),
}));
vi.mock('../uploadStagedArtifacts', () => ({ default: vi.fn() }));

import { getValidatedCommandParams as _getValidatedCommandParams } from '../../../helpers';
import { computeBaseFingerprint as _computeBaseFingerprint } from '../../../helpers/fingerprint';
import {
  buildBundleForPlatform as _buildBundleForPlatform,
  buildGateMetadata as _buildGateMetadata,
} from '../buildBundle';
import _uploadStagedArtifacts from '../uploadStagedArtifacts';

const mockGetValidatedCommandParams = vi.mocked(_getValidatedCommandParams);
const mockComputeBaseFingerprint = vi.mocked(_computeBaseFingerprint);
const mockBuildBundleForPlatform = vi.mocked(_buildBundleForPlatform);
const mockBuildGateMetadata = vi.mocked(_buildGateMetadata);
const mockUploadStagedArtifacts = vi.mocked(_uploadStagedArtifacts);

let stagedRun: (passedOptions: any) => Promise<{ url: string }>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

/** The project token this road spends, as getValidatedCommandParams resolves it. */
const PROJECT_TOKEN_CREDENTIAL = {
  kind: 'projectToken',
  token: 'token-value',
  apiToken: 'api',
  projectIndex: 3,
  teamId: 'team',
  fromSavedLogin: false,
} as const;

const IOS_DEVICE = {
  id: 'test-iphone',
  osVersion: '17.0',
  theme: 'light',
  locale: 'en',
  fontScale: '1.0',
};

/**
 * `CI` decides whether the closer publishes its machine-readable `url=` line, and it is set on
 * the runner this suite runs on - so it is cleared before every case and stated on purpose in
 * the two that are about it.
 */
const previousCI = process.env.CI;

afterAll(() => {
  if (previousCI === undefined) delete process.env.CI;
  else process.env.CI = previousCI;
});

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.CI;

  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
    throw new Error(`process.exit(${code})`);
  });
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  mockGetValidatedCommandParams.mockReturnValue({
    projectRoot: '/proj',
    credential: PROJECT_TOKEN_CREDENTIAL,
    devices: [IOS_DEVICE],
    wait: false,
  } as any);
  mockComputeBaseFingerprint.mockResolvedValue({
    android: { hash: 'BASE_FP' },
    ios: { hash: 'BASE_FP' },
  } as any);
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

/**
 * Every machine-readable `key=value` line the command printed, as an object -
 * read exactly the way a CI wrapper reads them (see actions/lib/cliOutputs.mjs).
 */
function outputKeys(): Record<string, string> {
  const keys: Record<string, string> = {};

  for (const line of printed().split('\n')) {
    const match = /^(native-needed|reason|base-fingerprint|url)=(.*)$/.exec(line.trim());
    if (match) keys[match[1]] = match[2];
  }

  return keys;
}

// ---------------------------------------------------------------------------
// native-needed: the gate refuses BEFORE anything is built
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// native-needed: the gate refuses AFTER bundling, on the real identity
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// fast-completed
// ---------------------------------------------------------------------------

describe('fast path ran to completion', () => {
  beforeEach(() => {
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });
  });

  it('prints no routing keys, opens the build, and returns the review URL - never as a url= line', async () => {
    // The run reached a build. The address is printed ONCE, on the `🔗 Review:` line, whoever is
    // reading (operator ruling 2026-09-15): there is no `url=` key for a machine, the GitHub
    // Action reads the address off the emoji line (actions/lib/cliOutputs.mjs). The routing keys
    // this file is about are published either way, so `CI` is stated here rather than inherited
    // from whatever machine runs the suite.
    process.env.CI = 'true';

    const result = await stagedRun({});

    const output = outputKeys();
    expect(output['native-needed']).toBeUndefined();
    expect(output['base-fingerprint']).toBeUndefined();
    expect(output.url).toBeUndefined();

    expect(mockOpenBuild).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ url: 'http://app/build' });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('prints no routing keys for a person either, and no url= line', async () => {
    delete process.env.CI;

    await stagedRun({});

    const output = outputKeys();
    expect(output['native-needed']).toBeUndefined();
    expect(output['base-fingerprint']).toBeUndefined();
    expect(output.url).toBeUndefined();
  });

  it('prints no machine lines before the run closer', async () => {
    await stagedRun({});

    expect(printed()).not.toContain('native-needed');
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

    expect(outputKeys()).toEqual({});
    expect(printed()).not.toContain('native-needed');
  });
});
