/**
 * Tests for registerBase's default-stdout hygiene (SHERLO-1937).
 *
 * registerBase is called once per platform on every `sherlo test --android/--ios` run, so
 * anything it prints unconditionally ships to every user's terminal. These
 * tests pin that internal staged-registration diagnostics (the raw
 * baseFingerprint hash dump and the per-platform metadata block) never reach
 * stdout. The fingerprint itself is inspected with `sherlo fingerprint`.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { GateMetadataInput } from '../gateMetadata';

const mockExtractGateMetadata = vi.fn();
const mockCheckStageable = vi.fn();

vi.mock('../gateMetadata', () => ({
  extractGateMetadata: (...args: unknown[]) => mockExtractGateMetadata(...args),
}));

vi.mock('../notStageable', () => ({
  checkStageable: (...args: unknown[]) => mockCheckStageable(...args),
}));

const STAGEABLE_GATE_METADATA: GateMetadataInput = {
  derivedFrom: 'binary',
  engineClass: 'hermes',
  bundleFormat: 'hbc',
  hasEmbeddedBundle: true,
  expoUpdatesEnabled: false,
  sdkProtocolVersion: '1.0.0',
  assetInventory: ['res/a.png', 'res/b.png'],
};

describe('registerBase - default stdout hygiene', () => {
  let registerBase: typeof import('../registerBase').registerBase;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockExtractGateMetadata.mockResolvedValue(STAGEABLE_GATE_METADATA);
    mockCheckStageable.mockResolvedValue({ stageable: true });

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mod = await import('../registerBase');
    registerBase = mod.registerBase;
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints no [Sherlo] diagnostic line and no metadata block', async () => {
    const result = await registerBase({
      binaryPath: '/tmp/app.apk',
      platform: 'android',
      projectRoot: '/tmp/project',
      bundlePath: 'assets/index.android.bundle',
      buildType: 'preview',
      baseFingerprintHash: 'fp-hash-abc123',
    });

    expect(result.registered).toBe(true);

    const out = logSpy.mock.calls.flat().join('\n');
    expect(out).not.toMatch(/\[Sherlo\]/);
    expect(out).not.toContain('Staged registration metadata computed');
    expect(out).not.toContain('fp-hash-abc123');
  });
});
