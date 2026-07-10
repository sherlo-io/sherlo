/**
 * Tests for the staged:check command (SHERLO-1692).
 *
 * Covers the CI-routing exit-code contract (fast=0, full=1, not-stageable=2),
 * the --json payload shape, and that GITHUB_OUTPUT is always written regardless
 * of --json - the three output forms must never drift apart. The gate is queried
 * through sdkClient.checkStagedGate (SHERLO-1718).
 *
 * A drift-guard test (see "gate metadata is real, not empty") asserts that
 * staged:check constructs gate metadata via the SAME buildBundleForPlatform +
 * buildGateMetadata path test:bundled uses and sends that non-empty metadata to
 * the gate - so a future refactor can never silently reintroduce `{}`, which
 * would make the command answer `full` even on a perfect fingerprint match.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCheckStagedGate } = vi.hoisted(() => ({
  mockCheckStagedGate: vi.fn(),
}));

vi.mock('@sherlo/sdk-client', () => ({
  default: vi.fn(() => ({ checkStagedGate: mockCheckStagedGate })),
}));

// staged:check builds a bundle and derives gate metadata through the exact same
// module test:bundled imports. Mock that module so the unit test never shells out
// to a real bundler, while still asserting the construction path is exercised.
vi.mock('../../testBundled/buildBundle', () => ({
  buildBundleForPlatform: vi.fn(),
  buildGateMetadata: vi.fn(),
}));

// Keep the real gate-decision mappers (outcomeToMode / resolveOverallMode /
// describeDiffSources) - they are pure and are what the command's correctness
// depends on. Only the IO-bound helpers are stubbed.
vi.mock('../../../helpers', async () => {
  const stagedGate = await vi.importActual<typeof import('../../../helpers/stagedGate')>(
    '../../../helpers/stagedGate'
  );

  return {
    getPlatformsToTest: vi.fn(),
    getTokenParts: vi.fn(),
    getValidatedCommandParams: vi.fn(),
    writeGithubOutput: vi.fn(),
    reporting: {
      flush: vi.fn().mockResolvedValue(undefined),
      addBreadcrumb: vi.fn(),
    },
    outcomeToMode: stagedGate.outcomeToMode,
    resolveOverallMode: stagedGate.resolveOverallMode,
    describeDiffSources: stagedGate.describeDiffSources,
  };
});

vi.mock('../../../helpers/fingerprint', () => ({
  computeBaseFingerprint: vi.fn(),
}));

import {
  getPlatformsToTest as _getPlatformsToTest,
  getTokenParts as _getTokenParts,
  getValidatedCommandParams as _getValidatedCommandParams,
  writeGithubOutput as _writeGithubOutput,
} from '../../../helpers';
import { computeBaseFingerprint as _computeBaseFingerprint } from '../../../helpers/fingerprint';
import {
  buildBundleForPlatform as _buildBundleForPlatform,
  buildGateMetadata as _buildGateMetadata,
} from '../../testBundled/buildBundle';

const mockGetPlatformsToTest = vi.mocked(_getPlatformsToTest);
const mockGetTokenParts = vi.mocked(_getTokenParts);
const mockGetValidatedCommandParams = vi.mocked(_getValidatedCommandParams);
const mockWriteGithubOutput = vi.mocked(_writeGithubOutput);
const mockComputeBaseFingerprint = vi.mocked(_computeBaseFingerprint);
const mockBuildBundleForPlatform = vi.mocked(_buildBundleForPlatform);
const mockBuildGateMetadata = vi.mocked(_buildGateMetadata);

let stagedCheck: (passedOptions: any) => Promise<void>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

/** A realistic non-empty bundle result (matches BundleResult shape). */
function bundleResult(overrides: Record<string, unknown> = {}): any {
  return {
    bundlePath: '/proj/.sherlo/bundled/bundle.ios.js',
    bundleFormat: 'plain-js',
    bundleSizeMb: 1.5,
    bundleHash: 'abc123',
    assetsDest: undefined,
    assetInventory: [],
    bundler: 'expo',
    ...overrides,
  };
}

/** A realistic non-empty GateMetadataInput - what buildGateMetadata produces. */
const GATE_METADATA = {
  engineClass: 'hermes',
  bundleFormat: 'plain-js',
  hasEmbeddedBundle: true,
  assetInventory: [],
  expoUpdatesEnabled: false,
  buildMetadata: { reactNativeVersion: '0.74.0', buildMode: 'release' },
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
    devices: [
      { id: 'test-iphone', osVersion: '17.0', theme: 'light', locale: 'en', fontScale: '1.0' },
    ],
  } as any);
  mockGetTokenParts.mockReturnValue({ apiToken: 'api', projectIndex: 3, teamId: 'team' });
  mockComputeBaseFingerprint.mockResolvedValue({ hash: 'FP1' } as any);
  mockBuildBundleForPlatform.mockResolvedValue(bundleResult());
  mockBuildGateMetadata.mockResolvedValue(GATE_METADATA as any);

  const mod = await import('../stagedCheck');
  stagedCheck = mod.default;
});

describe('staged:check exit-code contract', () => {
  it('exits 0 for mode=fast when the fingerprint matches a registered base', async () => {
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });

    await expect(stagedCheck({})).rejects.toThrow('process.exit(0)');
    expect(exitSpy).toHaveBeenCalledWith(0);
    // Sends the REAL gate metadata built for this platform - never empty `{}`.
    expect(mockCheckStagedGate).toHaveBeenCalledWith({
      baseFingerprint: 'FP1',
      gateMetadata: GATE_METADATA,
      platform: 'ios',
      projectIndex: 3,
      teamId: 'team',
    });
  });

  it('exits 1 for mode=full after a native change', async () => {
    mockGetPlatformsToTest.mockReturnValue(['android'] as any);
    mockCheckStagedGate.mockResolvedValue({ outcome: 'full-build-needed', diff: ['engineClass'] });

    await expect(stagedCheck({})).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 2 for mode=not-stageable', async () => {
    mockGetPlatformsToTest.mockReturnValue(['android'] as any);
    mockCheckStagedGate.mockResolvedValue({ outcome: 'not-stageable', diff: [] });

    await expect(stagedCheck({})).rejects.toThrow('process.exit(2)');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('exits 2 with a clear reason when no devices are configured (never crashes)', async () => {
    mockGetPlatformsToTest.mockReturnValue([] as any);

    await expect(stagedCheck({})).rejects.toThrow('process.exit(2)');
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(mockCheckStagedGate).not.toHaveBeenCalled();
  });

  it('exits 2 when the base fingerprint cannot be computed', async () => {
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
    mockComputeBaseFingerprint.mockResolvedValue({
      hash: null,
      debugMessage: 'not a React Native project',
    } as any);

    await expect(stagedCheck({})).rejects.toThrow('process.exit(2)');
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(mockCheckStagedGate).not.toHaveBeenCalled();
  });

  it('exits 2 (not-stageable) and never crashes when bundling fails', async () => {
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
    // buildBundleForPlatform throws a user-facing, multi-line message for a
    // non-stageable project (Hermes bytecode, version floor, ...).
    mockBuildBundleForPlatform.mockRejectedValue(
      new Error('Hermes bytecode (.hbc) bundle detected.\n\nStaged uploads require plain JS.')
    );

    await expect(stagedCheck({})).rejects.toThrow('process.exit(2)');
    expect(exitSpy).toHaveBeenCalledWith(2);
    // The gate is never queried when there is nothing stageable to describe.
    expect(mockCheckStagedGate).not.toHaveBeenCalled();

    // The reason is collapsed to a single, GITHUB_OUTPUT-safe line.
    const written = mockWriteGithubOutput.mock.calls[0][0] as Record<string, string>;
    expect(written.mode).toBe('not-stageable');
    expect(written.reason).toContain('Hermes bytecode');
    expect(written.reason).not.toContain('\n');
  });

  it('takes the worst outcome across platforms (one full + one fast -> full)', async () => {
    mockGetPlatformsToTest.mockReturnValue(['android', 'ios'] as any);
    mockCheckStagedGate
      .mockResolvedValueOnce({ outcome: 'fast', diff: [] })
      .mockResolvedValueOnce({ outcome: 'full-build-needed', diff: ['assetInventory'] });

    await expect(stagedCheck({})).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('output forms stay in sync', () => {
  beforeEach(() => {
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
    mockCheckStagedGate.mockResolvedValue({ outcome: 'full-build-needed', diff: ['engineClass'] });
  });

  it('--json prints a single machine-readable JSON payload with mode + reason', async () => {
    await expect(stagedCheck({ json: true })).rejects.toThrow('process.exit(1)');

    const jsonCalls = logSpy.mock.calls
      .map((c: any[]) => c[0])
      .filter((arg: string) => {
        try {
          JSON.parse(arg);
          return true;
        } catch {
          return false;
        }
      });
    expect(jsonCalls).toHaveLength(1);

    const payload = JSON.parse(jsonCalls[0]);
    expect(payload.mode).toBe('full');
    expect(payload.reason).toContain('JS engine (Hermes/JSC)');
    expect(payload.baseFingerprint).toBe('FP1');
  });

  it('always writes GITHUB_OUTPUT (mode + reason + baseFingerprint), --json or not', async () => {
    await expect(stagedCheck({})).rejects.toThrow('process.exit(1)');

    expect(mockWriteGithubOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'full',
        baseFingerprint: 'FP1',
      })
    );
    const written = mockWriteGithubOutput.mock.calls[0][0] as Record<string, string>;
    expect(written.reason).toContain('JS engine (Hermes/JSC)');
  });
});

// Drift guard (Director review, PR #180): staged:check MUST construct real gate
// metadata via the same code path test:bundled uses and send it to the gate. An
// empty `{}` makes every field comparison a mismatch, so the command could never
// answer `fast` against a genuinely registered base (violates AC1). A client-mock
// alone cannot catch that regression - these assertions verify the
// metadata-CONSTRUCTION path, not just the gate's return handling.
describe('gate metadata is real, not empty (drift guard)', () => {
  it('builds a bundle and derives metadata per platform via the test:bundled path', async () => {
    mockGetPlatformsToTest.mockReturnValue(['android', 'ios'] as any);
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });

    await expect(stagedCheck({})).rejects.toThrow('process.exit(0)');

    // The SAME construction functions test:bundled imports are exercised, once
    // per platform - not re-implemented locally.
    expect(mockBuildBundleForPlatform).toHaveBeenCalledWith({
      projectRoot: '/proj',
      platform: 'android',
    });
    expect(mockBuildBundleForPlatform).toHaveBeenCalledWith({
      projectRoot: '/proj',
      platform: 'ios',
    });
    expect(mockBuildGateMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: '/proj',
        platform: 'android',
        bundleResult: expect.any(Object),
      })
    );
  });

  it('forwards the constructed metadata to the gate (never an empty object)', async () => {
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });

    await expect(stagedCheck({})).rejects.toThrow('process.exit(0)');

    const sent = mockCheckStagedGate.mock.calls[0][0].gateMetadata;
    // Exactly the object buildGateMetadata returned - and it is non-empty.
    expect(sent).toBe(GATE_METADATA);
    expect(Object.keys(sent).length).toBeGreaterThan(0);
  });
});
