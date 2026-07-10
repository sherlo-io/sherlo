/**
 * Tests for test:bundled `--on-stale` (SHERLO-1692).
 *
 * When the staged gate (checkStagedGate) finds the base stale:
 *   - default `fail` refuses with a message containing the fingerprint diff and
 *     runs no tests (never silently skipped);
 *   - `fail` WITHOUT any fullBuild config is still the explicit diff-bearing
 *     failure;
 *   - `build` runs the configured `staged.fullBuild` commands in order, then
 *     completes as a full test:standard run that registers a fresh base;
 *   - `build` WITHOUT fullBuild config fails explicitly (never skips tests).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCheckStagedGate } = vi.hoisted(() => ({
  mockCheckStagedGate: vi.fn(),
}));

vi.mock('@sherlo/sdk-client', () => ({
  default: vi.fn(() => ({
    checkStagedGate: mockCheckStagedGate,
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
  runShellCommand: vi.fn().mockResolvedValue(''),
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

// test:standard is the full-run delegate for --on-stale=build. Mock it so we can
// assert the transition happens (and returns its url) without running the chain.
vi.mock('../../testStandard', () => ({
  default: vi.fn().mockResolvedValue({ url: 'http://app/full-run' }),
}));

import {
  getPlatformsToTest as _getPlatformsToTest,
  getTokenParts as _getTokenParts,
  getValidatedCommandParams as _getValidatedCommandParams,
  runShellCommand as _runShellCommand,
} from '../../../helpers';
import { computeBaseFingerprint as _computeBaseFingerprint } from '../../../helpers/fingerprint';
import {
  buildBundleForPlatform as _buildBundleForPlatform,
  buildGateMetadata as _buildGateMetadata,
} from '../buildBundle';
import _testStandard from '../../testStandard';

const mockGetPlatformsToTest = vi.mocked(_getPlatformsToTest);
const mockGetTokenParts = vi.mocked(_getTokenParts);
const mockGetValidatedCommandParams = vi.mocked(_getValidatedCommandParams);
const mockRunShellCommand = vi.mocked(_runShellCommand);
const mockComputeBaseFingerprint = vi.mocked(_computeBaseFingerprint);
const mockBuildBundleForPlatform = vi.mocked(_buildBundleForPlatform);
const mockBuildGateMetadata = vi.mocked(_buildGateMetadata);
const mockTestStandard = vi.mocked(_testStandard);

let testBundled: (passedOptions: any) => Promise<{ url: string }>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

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

/** Command params with an optional staged.fullBuild config. */
function commandParams(staged?: any): any {
  return {
    projectRoot: '/proj',
    token: 'token-value',
    devices: [IOS_DEVICE],
    ios: '/proj/app.tar.gz',
    ...(staged ? { staged } : {}),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();

  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
    throw new Error(`process.exit(${code})`);
  });
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
  mockComputeBaseFingerprint.mockResolvedValue({ hash: 'BASE_FP' } as any);
  mockBuildBundleForPlatform.mockResolvedValue(bundleResult());
  mockBuildGateMetadata.mockResolvedValue({ engineClass: 'hermes' } as any);
  mockGetTokenParts.mockReturnValue({ apiToken: 'api', projectIndex: 3, teamId: 'team' });
  // The gate finds the base stale (native change).
  mockCheckStagedGate.mockResolvedValue({ outcome: 'full-build-needed', diff: ['engineClass'] });

  const mod = await import('../testBundled');
  testBundled = mod.default;
});

afterEach(() => {
  exitSpy.mockRestore();
  logSpy.mockRestore();
});

describe('--on-stale=fail (default)', () => {
  it('refuses with the fingerprint diff and runs no tests', async () => {
    mockGetValidatedCommandParams.mockReturnValue(commandParams());

    await expect(testBundled({})).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const allLogs = logSpy.mock.calls.map((c: any[]) => c.join(' '));
    // Diff-bearing: the changed source is named.
    expect(allLogs.some((line: string) => line.includes('JS engine (Hermes/JSC)'))).toBe(true);
    // Never delegates to a full run on fail.
    expect(mockTestStandard).not.toHaveBeenCalled();
    expect(mockRunShellCommand).not.toHaveBeenCalled();
  });

  it('fails explicitly even without any fullBuild config (never silently skips)', async () => {
    mockGetValidatedCommandParams.mockReturnValue(commandParams());

    await expect(testBundled({ onStale: 'fail' })).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockTestStandard).not.toHaveBeenCalled();
  });
});

describe('--on-stale=build', () => {
  it('runs the configured fullBuild commands in order, then a registering full run', async () => {
    mockGetValidatedCommandParams.mockReturnValue(
      commandParams({ fullBuild: { ios: ['echo build-1', 'echo build-2'] } })
    );

    const result = await testBundled({ onStale: 'build' });

    // Commands ran in order.
    expect(mockRunShellCommand).toHaveBeenNthCalledWith(1, {
      command: 'echo build-1',
      projectRoot: '/proj',
    });
    expect(mockRunShellCommand).toHaveBeenNthCalledWith(2, {
      command: 'echo build-2',
      projectRoot: '/proj',
    });

    // Transitioned to the full test:standard run and returned its url.
    expect(mockTestStandard).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ url: 'http://app/full-run' });
  });

  it('fails explicitly when fullBuild config is missing (never silently skips)', async () => {
    mockGetValidatedCommandParams.mockReturnValue(commandParams());

    await expect(testBundled({ onStale: 'build' })).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockRunShellCommand).not.toHaveBeenCalled();
    expect(mockTestStandard).not.toHaveBeenCalled();

    const allLogs = logSpy.mock.calls.map((c: any[]) => c.join(' '));
    expect(allLogs.some((line: string) => line.includes('staged.fullBuild'))).toBe(true);
  });
});
