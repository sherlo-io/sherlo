/**
 * Tests for the testBundled command - exit-code contract and refusal paths.
 *
 * Covers the reshape requirements:
 *  - Readiness gate (SHERLO_DEVTOOLS unset) prints the SHERLO-1707 message
 *    and exits non-zero.
 *  - "No devices configured" path exits non-zero.
 *  - Fingerprint-unavailable path prints the test:standard fallback line
 *    and exits non-zero.
 *
 * Does NOT re-test buildBundle refusal paths (HBC / RAM / version-floor) -
 * those are covered by buildBundle.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest above all imports)
// ---------------------------------------------------------------------------

vi.mock('../../../helpers', () => ({
  getPlatformsToTest: vi.fn(),
  getValidatedCommandParams: vi.fn(),
  printSherloIntro: vi.fn(),
  reporting: {
    flush: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../helpers/fingerprint', () => ({
  computeBaseFingerprint: vi.fn(),
}));

vi.mock('../buildBundle', () => ({
  buildBundleForPlatform: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocked dependency accessors (vi.mocked gives proper Mock types)
// ---------------------------------------------------------------------------

import {
  getPlatformsToTest as _getPlatformsToTest,
  getValidatedCommandParams as _getValidatedCommandParams,
  printSherloIntro as _printSherloIntro,
} from '../../../helpers';
import { computeBaseFingerprint as _computeBaseFingerprint } from '../../../helpers/fingerprint';
import { buildBundleForPlatform as _buildBundleForPlatform } from '../buildBundle';

const mockGetPlatformsToTest = vi.mocked(_getPlatformsToTest);
const mockGetValidatedCommandParams = vi.mocked(_getValidatedCommandParams);
const mockPrintSherloIntro = vi.mocked(_printSherloIntro);
const mockComputeBaseFingerprint = vi.mocked(_computeBaseFingerprint);
const mockBuildBundleForPlatform = vi.mocked(_buildBundleForPlatform);

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

let testBundled: (passedOptions: any) => Promise<{ url: string }>;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../testBundled');
  testBundled = mod.default;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockOptions(): any {
  return {};
}

// ---------------------------------------------------------------------------
// Readiness gate - SHERLO_DEVTOOLS unset
// ---------------------------------------------------------------------------

describe('readiness gate', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });

    delete process.env.SHERLO_DEVTOOLS;

    // Type casts are intentional - mock return values are stand-ins that
    // only need to satisfy the code paths under test.
    mockGetValidatedCommandParams.mockReturnValue({
      projectRoot: '/tmp/test-project',
      devices: [
        { id: 'test-iphone', osVersion: '17.0', theme: 'light', locale: 'en', fontScale: '1.0' },
      ],
    } as any);
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
    mockPrintSherloIntro.mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('prints the SHERLO-1707 message and exits non-zero when SHERLO_DEVTOOLS is unset', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(testBundled(mockOptions())).rejects.toThrow('process.exit(1)');

    const allCalls = logSpy.mock.calls.map((c) => c.join(' '));
    expect(allCalls.some((call) => call.includes('SHERLO-1707'))).toBe(true);
    expect(allCalls.some((call) => call.includes('test:standard'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);

    logSpy.mockRestore();
  });

  it('does NOT hit the readiness gate when SHERLO_DEVTOOLS=1', async () => {
    process.env.SHERLO_DEVTOOLS = '1';

    mockComputeBaseFingerprint.mockResolvedValue({
      hash: 'abc123def456',
      debugMessage: undefined,
    } as any);
    mockBuildBundleForPlatform.mockResolvedValue({
      bundlePath: '/tmp/bundle.js',
      bundleSizeMb: 2.0,
      bundleFormat: 'plain-js',
      bundleHash: 'abc123',
      bundler: 'metro',
      assetInventory: [],
      assetsDest: undefined,
    } as any);
    const result = await testBundled(mockOptions());
    expect(result).toEqual({ url: '' });
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

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
    mockPrintSherloIntro.mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('exits non-zero when no devices are configured', async () => {
    await expect(testBundled(mockOptions())).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('prints the no-devices guidance message', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(testBundled(mockOptions())).rejects.toThrow('process.exit(1)');

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

    process.env.SHERLO_DEVTOOLS = '1';

    mockGetValidatedCommandParams.mockReturnValue({
      projectRoot: '/tmp/test-project',
      devices: [
        { id: 'test-iphone', osVersion: '17.0', theme: 'light', locale: 'en', fontScale: '1.0' },
      ],
    } as any);
    mockGetPlatformsToTest.mockReturnValue(['ios'] as any);
    mockPrintSherloIntro.mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    delete process.env.SHERLO_DEVTOOLS;
  });

  it('exits non-zero when fingerprint computation returns no hash', async () => {
    mockComputeBaseFingerprint.mockResolvedValue({
      hash: '',
      debugMessage: 'No base binary found',
    } as any);

    await expect(testBundled(mockOptions())).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('prints the test:standard fallback line when fingerprint is unavailable', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockComputeBaseFingerprint.mockResolvedValue({
      hash: '',
      debugMessage: 'No base binary found',
    } as any);

    await expect(testBundled(mockOptions())).rejects.toThrow('process.exit(1)');

    const allCalls = logSpy.mock.calls.map((c) => c.join(' '));
    expect(allCalls.some((call) => call.includes('test:standard'))).toBe(true);
    expect(allCalls.some((call) => call.includes('Staged upload unavailable'))).toBe(true);

    logSpy.mockRestore();
  });

  it('does not exit when fingerprint is available', async () => {
    mockComputeBaseFingerprint.mockResolvedValue({
      hash: 'abc123def456',
      debugMessage: undefined,
    } as any);
    mockBuildBundleForPlatform.mockResolvedValue({
      bundlePath: '/tmp/bundle.js',
      bundleSizeMb: 2.0,
      bundleFormat: 'plain-js',
      bundleHash: 'abc123',
      bundler: 'metro',
      assetInventory: [],
      assetsDest: undefined,
    } as any);
    const result = await testBundled(mockOptions());
    expect(result).toEqual({ url: '' });
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
