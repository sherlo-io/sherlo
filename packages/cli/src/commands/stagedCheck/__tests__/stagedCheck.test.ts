/**
 * Tests for the staged:check command (SHERLO-1692, SHERLO-1760).
 *
 * Covers the CI-routing exit-code contract (fast=0, full=1, not-stageable=2),
 * the --json payload shape, and that GITHUB_OUTPUT is always written regardless
 * of --json - the three output forms must never drift apart. The gate is queried
 * through sdkClient.checkStagedGate (SHERLO-1718).
 *
 * staged:check is a TRUE no-build probe: it never runs a bundler and never opens
 * a binary, so it must not fabricate any APK-derived identity dimension. The
 * probe-payload guard below asserts the sent gate metadata carries ONLY the
 * `derivedFrom: 'none'` marker and no bundleFormat / assetInventory /
 * hasEmbeddedBundle / sdkProtocolVersion - the deployed gate then rests a `fast`
 * decision on the fingerprint match alone (SHERLO-1761).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCheckStagedGate } = vi.hoisted(() => ({
  mockCheckStagedGate: vi.fn(),
}));

vi.mock('@sherlo/sdk-client', () => ({
  default: vi.fn(() => ({ checkStagedGate: mockCheckStagedGate })),
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

const mockGetPlatformsToTest = vi.mocked(_getPlatformsToTest);
const mockGetTokenParts = vi.mocked(_getTokenParts);
const mockGetValidatedCommandParams = vi.mocked(_getValidatedCommandParams);
const mockWriteGithubOutput = vi.mocked(_writeGithubOutput);
const mockComputeBaseFingerprint = vi.mocked(_computeBaseFingerprint);

let stagedCheck: (passedOptions: any) => Promise<void>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

/** The ONLY gate metadata a no-build probe may send: the `none` marker, nothing else. */
const PROBE_METADATA = { derivedFrom: 'none' };

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

  const mod = await import('../stagedCheck');
  stagedCheck = mod.default;
});

describe('staged:check exit-code contract', () => {
  it('exits 0 for mode=fast when the fingerprint matches a registered base', async () => {
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });

    await expect(stagedCheck({})).rejects.toThrow('process.exit(0)');
    expect(exitSpy).toHaveBeenCalledWith(0);
    // Sends ONLY the `none` derivation marker - never a fabricated dimension.
    expect(mockCheckStagedGate).toHaveBeenCalledWith({
      baseFingerprint: 'FP1',
      gateMetadata: PROBE_METADATA,
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

  it('exits 2 for mode=not-stageable when no base is registered for the fingerprint', async () => {
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

// Probe-payload guard (SHERLO-1760): staged:check is a NO-BUILD probe. It must
// never bundle and never fabricate a binary-identity dimension it cannot know
// without opening an APK. The gate excludes none-marked dims from the identity
// diff, so any fabricated dimension here would be dead weight at best and, before
// SHERLO-1761, forced a false `full` on a byte-identical workspace. These
// assertions pin the honest, marker-only payload so a refactor cannot silently
// reintroduce a source-derived estimate.
describe('probe payload is marker-only (no fabricated identity dimensions)', () => {
  it('sends derivedFrom: none and NOTHING else per platform', async () => {
    mockGetPlatformsToTest.mockReturnValue(['android', 'ios'] as any);
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });

    await expect(stagedCheck({})).rejects.toThrow('process.exit(0)');

    for (const call of mockCheckStagedGate.mock.calls) {
      const sent = call[0].gateMetadata;
      expect(sent).toEqual({ derivedFrom: 'none' });
      // No binary-identity / bundle-derived facts a no-build probe cannot know.
      expect(sent).not.toHaveProperty('bundleFormat');
      expect(sent).not.toHaveProperty('assetInventory');
      expect(sent).not.toHaveProperty('hasEmbeddedBundle');
      expect(sent).not.toHaveProperty('sdkProtocolVersion');
      expect(sent).not.toHaveProperty('engineClass');
    }
  });
});
