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
      baseFingerprint: { hash: 'fp-hash-abc123' },
    });

    expect(result.registered).toBe(true);

    const out = logSpy.mock.calls.flat().join('\n');
    expect(out).not.toMatch(/\[Sherlo\]/);
    expect(out).not.toContain('Staged registration metadata computed');
    expect(out).not.toContain('fp-hash-abc123');
  });
});

describe('registerBase - the source list a stored base keeps', () => {
  it("a push that stores a base sends its source list: paths, hashes and module versions, never a file's contents", async () => {
    vi.clearAllMocks();
    mockExtractGateMetadata.mockResolvedValue(STAGEABLE_GATE_METADATA);
    mockCheckStageable.mockResolvedValue({ stageable: true });
    const { registerBase } = await import('../registerBase');

    const result = await registerBase({
      binaryPath: '/tmp/app.apk',
      platform: 'android',
      projectRoot: '/tmp/project',
      bundlePath: 'assets/index.android.bundle',
      buildType: 'preview',
      baseFingerprint: {
        hash: 'fp-hash-android',
        preimage: {
          workflow: 'bare',
          nativeSources: [
            { type: 'dir', id: 'android', hash: 'folder-hash' },
            { type: 'file', id: 'app.json', hash: 'app-json-hash' },
            { type: 'contents', id: 'expoConfigPlugins', hash: 'plugins-hash' },
          ],
          lockfiles: [{ file: 'Gemfile.lock', digest: 'gemfile-digest' }],
          autolinkedModules: ['@react-native-community/slider@4.5.0', 'react-native-maps@1.2.0'],
          nativeFolderFiles: [
            { path: 'android/app/build.gradle', hash: 'gradle-hash' },
            { path: 'android/settings.gradle', hash: 'settings-hash' },
          ],
        },
      },
    });

    expect(result.sourceList).toEqual({
      sources: [
        {
          path: 'android',
          hash: 'folder-hash',
          kind: 'dir',
          files: [
            { path: 'android/app/build.gradle', hash: 'gradle-hash' },
            { path: 'android/settings.gradle', hash: 'settings-hash' },
          ],
        },
        { path: 'app.json', hash: 'app-json-hash', kind: 'file' },
        { path: 'expoConfigPlugins', hash: 'plugins-hash', kind: 'contents' },
        { path: 'Gemfile.lock', hash: 'gemfile-digest', kind: 'file' },
      ],
      modules: [
        { name: '@react-native-community/slider', version: '4.5.0' },
        { name: 'react-native-maps', version: '1.2.0' },
      ],
    });
    // Every entry is a path or name with a hash or version - no field could carry contents.
    for (const source of result.sourceList?.sources ?? []) {
      expect(Object.keys(source).sort()).toEqual(
        source.files ? ['files', 'hash', 'kind', 'path'] : ['hash', 'kind', 'path']
      );
    }
  });
});
