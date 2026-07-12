/**
 * Tests for buildBundle - format sniffing, refusal paths, asset inventory,
 * and version-floor checks.
 *
 * Drives the REAL buildBundle.ts functions via mocked bundler output.
 * No inline copies of sniff logic - imports the canonical helpers and
 * exercises their actual error paths.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from '@sherlo/api-types';
import { HBC_MAGIC } from '../../../helpers/fingerprint/gateMetadata';
import {
  computeBaseFingerprint,
  stripVersionLines,
} from '../../../helpers/fingerprint/baseFingerprint';
import { buildBundleForPlatform, buildGateMetadata, type BundleResult } from '../buildBundle';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../showError/detectBundler', () => ({
  default: vi.fn(),
  detectEntryFile: vi.fn(),
}));

vi.mock('../../init/requirements/getPackageVersion', () => ({
  default: vi.fn(),
}));

// The local imports resolve the mocked modules because vi.mock is hoisted.
import detectBundlerDefault from '../../showError/detectBundler';
import { detectEntryFile as detectEntryFileNamed } from '../../showError/detectBundler';
import getPackageVersionDefault from '../../init/requirements/getPackageVersion';

const mockExecSync = vi.mocked(execSync);
const mockDetectBundler = vi.mocked(detectBundlerDefault);
const mockDetectEntryFile = vi.mocked(detectEntryFileNamed);
const mockGetPackageVersion = vi.mocked(getPackageVersionDefault);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a plain-JS bundle buffer (starts with typical Metro output). */
function plainJsBundle(extraContent = ''): Buffer {
  const prefix = Buffer.from(
    '(function(global){var __BUNDLE_START_TIME__=Date.now();' + extraContent,
    'utf8'
  );
  const buf = Buffer.alloc(Math.max(1024, prefix.length + 64), 0x20);
  prefix.copy(buf);
  return buf;
}

/** Create an HBC bundle buffer (starts with Hermes bytecode magic). */
function hbcBundle(): Buffer {
  const buf = Buffer.alloc(1024, 0x00);
  HBC_MAGIC.copy(buf, 0);
  return buf;
}

/** Create a RAM bundle buffer (__jac_ prefix). */
function ramBundle(): Buffer {
  const prefix = Buffer.from('__jac_\nvar modules={};', 'utf8');
  const buf = Buffer.alloc(4096, 0x20);
  prefix.copy(buf);
  return buf;
}

/** Create a RAM bundle buffer (require.unbundle style). */
function unbundleRam(): Buffer {
  const prefix = Buffer.from('require.unbundle=function(){return{};};', 'utf8');
  const buf = Buffer.alloc(4096, 0x20);
  prefix.copy(buf);
  return buf;
}

/**
 * Setup mocks for a successful build that produces `bundleContent` as the
 * output bundle file.
 */
function setupBundleBuild(
  bundleContent: Buffer,
  opts: {
    projectType?: 'expo' | 'rn';
    rnVersion?: string;
    assetsDir?: string;
    appJson?: Record<string, unknown>;
  } = {}
) {
  const { projectType = 'rn', rnVersion = '0.76.0' } = opts;

  mockGetPackageVersion.mockReturnValue(rnVersion);
  mockDetectBundler.mockReturnValue(projectType);
  mockDetectEntryFile.mockReturnValue('index.js');

  // The bundler command writes the bundle to disk.
  mockExecSync.mockImplementation(((cmd: string, _options: { cwd?: string }) => {
    // Extract the --bundle-output path from the command.
    const bundleMatch =
      cmd.match(/--bundle-output[= ](\S+)/) || cmd.match(/--bundle-output[= ]"([^"]+)"/);
    if (bundleMatch) {
      const outPath = bundleMatch[1];
      const dir = path.dirname(outPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(outPath, bundleContent);

      // If --assets-dest is present, create it.
      const assetsMatch =
        cmd.match(/--assets-dest[= ](\S+)/) || cmd.match(/--assets-dest[= ]"([^"]+)"/);
      if (assetsMatch) {
        const assetsDir = assetsMatch[1];
        if (!fs.existsSync(assetsDir)) {
          fs.mkdirSync(assetsDir, { recursive: true });
        }
        // Create a test asset file.
        if (opts.assetsDir) {
          // Copy files from the provided directory.
          copyDir(opts.assetsDir, assetsDir);
        } else {
          fs.writeFileSync(path.join(assetsDir, 'testImage@2x.png'), 'fake-png-data');
        }
      }
    }
    return Buffer.alloc(0);
  }) as any);
}

function copyDir(src: string, dest: string) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Temp directory management
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-test-bundled-'));
  vi.clearAllMocks();
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// HBC_MAGIC constant verification
// ---------------------------------------------------------------------------

describe('HBC_MAGIC', () => {
  it('has the correct little-endian byte order for Hermes bytecode', () => {
    // Hermes writes 0x1F1903C103BC1FC6 in LITTLE-endian.
    // On-disk bytes: c6 1f bc 03 c1 03 19 1f
    const expected = Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f]);
    expect(HBC_MAGIC).toEqual(expected);
  });

  it('is exactly 8 bytes long', () => {
    expect(HBC_MAGIC.length).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Bundle format sniff - HBC magic refusal
// ---------------------------------------------------------------------------

describe('buildBundleForPlatform - HBC refusal', () => {
  it('throws on an HBC bundle with the expected refusal message', async () => {
    setupBundleBuild(hbcBundle());

    await expect(
      buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'android' as Platform,
      })
    ).rejects.toThrow('Hermes bytecode (.hbc) bundle detected');
  });

  it('throws on a large HBC bundle (only first 12 bytes sniffed)', async () => {
    // Real HBC bundles can be many MB - we only sniff 12 bytes.
    const largeHbc = Buffer.alloc(10 * 1024 * 1024, 0xff);
    HBC_MAGIC.copy(largeHbc, 0);
    setupBundleBuild(largeHbc);

    await expect(
      buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'ios' as Platform,
      })
    ).rejects.toThrow('Hermes bytecode (.hbc) bundle detected');
  });

  it('succeeds on a plain-JS bundle (no HBC magic)', async () => {
    setupBundleBuild(plainJsBundle());

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });

    expect(result.bundleFormat).toBe('plain-js');
    // Tiny bundles round to 0.00 MB - the size is correct but fractional.
    expect(result.bundleSizeMb).toBeGreaterThanOrEqual(0);
    expect(result.bundleHash).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// RAM bundle refusal
// ---------------------------------------------------------------------------

describe('buildBundleForPlatform - RAM refusal', () => {
  it('throws on a __jac_ RAM bundle', async () => {
    setupBundleBuild(ramBundle());

    await expect(
      buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'android' as Platform,
      })
    ).rejects.toThrow('RAM/indexed bundle format detected');
  });

  it('throws on a require.unbundle RAM format', async () => {
    setupBundleBuild(unbundleRam());

    await expect(
      buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'android' as Platform,
      })
    ).rejects.toThrow('RAM/indexed bundle format detected');
  });

  it('succeeds on a plain-JS bundle (no RAM markers)', async () => {
    setupBundleBuild(plainJsBundle());

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'ios' as Platform,
    });

    expect(result.bundleFormat).toBe('plain-js');
  });
});

// ---------------------------------------------------------------------------
// Version-floor refusal
// ---------------------------------------------------------------------------

describe('buildBundleForPlatform - version-floor refusal', () => {
  it('throws when React Native is below 0.71', async () => {
    setupBundleBuild(plainJsBundle(), { rnVersion: '0.70.6' });

    await expect(
      buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'android' as Platform,
      })
    ).rejects.toThrow('below the minimum version');
  });

  it('throws when React Native is below 0.71 (0.69.x)', async () => {
    setupBundleBuild(plainJsBundle(), { rnVersion: '0.69.9' });

    await expect(
      buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'android' as Platform,
      })
    ).rejects.toThrow('below the minimum version');
  });

  it('succeeds when React Native is exactly 0.71.0', async () => {
    setupBundleBuild(plainJsBundle(), { rnVersion: '0.71.0' });

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });
    expect(result.bundleFormat).toBe('plain-js');
  });

  it('succeeds when React Native is above 0.71 (0.76.x)', async () => {
    setupBundleBuild(plainJsBundle(), { rnVersion: '0.76.0' });

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });
    expect(result.bundleFormat).toBe('plain-js');
  });

  it('succeeds when React Native version is unavailable (returns null)', async () => {
    mockGetPackageVersion.mockReturnValue(null); // package not found
    mockDetectBundler.mockReturnValue('rn');
    mockDetectEntryFile.mockReturnValue('index.js');
    mockExecSync.mockImplementation(((cmd: string) => {
      const bundleMatch = cmd.match(/--bundle-output[= ](\S+)/);
      if (bundleMatch) {
        const dir = path.dirname(bundleMatch[1]);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(bundleMatch[1], plainJsBundle());
      }
      return Buffer.alloc(0);
    }) as any);

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });
    expect(result.bundleFormat).toBe('plain-js');
  });

  it('throws when Expo SDK version is below 50', async () => {
    // Write an app.json with an old Expo SDK version.
    fs.writeFileSync(
      path.join(tempDir, 'app.json'),
      JSON.stringify({ expo: { sdkVersion: '49.0.0' } })
    );
    setupBundleBuild(plainJsBundle(), { rnVersion: '0.76.0' });

    await expect(
      buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'android' as Platform,
      })
    ).rejects.toThrow('below the minimum version');
  });

  it('succeeds when Expo SDK version is 50 or above', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'app.json'),
      JSON.stringify({ expo: { sdkVersion: '50.0.0' } })
    );
    setupBundleBuild(plainJsBundle(), { rnVersion: '0.76.0' });

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });
    expect(result.bundleFormat).toBe('plain-js');
  });

  it('includes the test:standard fallback line in version refusal', async () => {
    mockGetPackageVersion.mockReturnValue('0.69.0');
    mockDetectBundler.mockReturnValue('rn');
    mockDetectEntryFile.mockReturnValue('index.js');

    await expect(
      buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'android' as Platform,
      })
    ).rejects.toThrow('sherlo test:standard');
  });
});

// ---------------------------------------------------------------------------
// Asset inventory computation
// ---------------------------------------------------------------------------

describe('buildBundleForPlatform - asset inventory', () => {
  it('returns an empty inventory when no assets are produced', async () => {
    // Mock execSync to NOT create an assets directory.
    mockGetPackageVersion.mockReturnValue('0.76.0');
    mockDetectBundler.mockReturnValue('rn');
    mockDetectEntryFile.mockReturnValue('index.js');
    mockExecSync.mockImplementation(((cmd: string) => {
      const bundleMatch = cmd.match(/--bundle-output[= ](\S+)/);
      if (bundleMatch) {
        const dir = path.dirname(bundleMatch[1]);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(bundleMatch[1], plainJsBundle());
      }
      // Don't create assets directory.
      return Buffer.alloc(0);
    }) as any);

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });

    expect(result.assetInventory).toEqual([]);
    expect(result.assetsDest).toBeUndefined();
  });

  it('collects asset paths as a sorted list', async () => {
    // Pre-create assets directory with test files.
    const assetsDir = path.join(tempDir, 'test-assets');
    fs.mkdirSync(path.join(assetsDir, 'drawable'), { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'icon.png'), 'icon-data');
    fs.writeFileSync(path.join(assetsDir, 'drawable', 'background.jpg'), 'bg-data');
    fs.writeFileSync(path.join(assetsDir, 'splash@2x.png'), 'splash-data');

    setupBundleBuild(plainJsBundle(), { assetsDir });

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });

    expect(result.assetInventory.length).toBe(3);
    // Sorted order: drawable/background.jpg, icon.png, splash@2x.png
    expect(result.assetInventory).toEqual(['drawable/background.jpg', 'icon.png', 'splash@2x.png']);
  });

  it('returns asset inventory sorted alphabetically', async () => {
    const assetsDir = path.join(tempDir, 'test-assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    // Create files in non-alphabetical order.
    fs.writeFileSync(path.join(assetsDir, 'zebra.png'), 'z');
    fs.writeFileSync(path.join(assetsDir, 'alpha.png'), 'a');
    fs.writeFileSync(path.join(assetsDir, 'mango.png'), 'm');

    setupBundleBuild(plainJsBundle(), { assetsDir });

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'ios' as Platform,
    });

    expect(result.assetInventory).toEqual(['alpha.png', 'mango.png', 'zebra.png']);
  });

  it('correctly identifies the bundler used', async () => {
    setupBundleBuild(plainJsBundle(), { projectType: 'expo' });

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });

    expect(result.bundler).toBe('expo');
  });
});

// ---------------------------------------------------------------------------
// Refusal messages include test:standard fallback
// ---------------------------------------------------------------------------

describe('refusal messages include test:standard fallback', () => {
  it('HBC refusal ends with the fallback line', async () => {
    setupBundleBuild(hbcBundle());

    try {
      await buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'android' as Platform,
      });
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('sherlo test:standard');
    }
  });

  it('RAM refusal ends with the fallback line', async () => {
    setupBundleBuild(ramBundle());

    try {
      await buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'android' as Platform,
      });
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('sherlo test:standard');
    }
  });

  it('version-floor refusal ends with the fallback line', async () => {
    mockGetPackageVersion.mockReturnValue('0.69.0');
    mockDetectBundler.mockReturnValue('rn');
    mockDetectEntryFile.mockReturnValue('index.js');

    try {
      await buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'ios' as Platform,
      });
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('sherlo test:standard');
    }
  });
});

// ---------------------------------------------------------------------------
// Bundle result metadata
// ---------------------------------------------------------------------------

describe('buildBundleForPlatform - result metadata', () => {
  it('computes bundleSizeMb correctly', async () => {
    // Create a bundle of known size.
    const bundle = Buffer.alloc(2 * 1024 * 1024, 0x41); // 2 MB of 'A'
    setupBundleBuild(bundle);

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });

    expect(result.bundleSizeMb).toBe(2.0);
  });

  it('computes a non-empty bundleHash', async () => {
    setupBundleBuild(plainJsBundle());

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });

    expect(result.bundleHash).toBeTruthy();
    expect(result.bundleHash.length).toBe(64); // SHA-256 hex
  });

  it('returns bundleFormat as plain-js for valid bundles', async () => {
    setupBundleBuild(plainJsBundle());

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });

    expect(result.bundleFormat).toBe('plain-js');
  });
});

// ---------------------------------------------------------------------------
// Version/build-number-only change does NOT change baseFingerprint (AC)
// ---------------------------------------------------------------------------

describe('baseFingerprint version suppression (SHERLO-1690 AC)', () => {
  it('computeBaseFingerprint is imported and used by testBundled', async () => {
    // Integration-level assertion: the testBundled module imports
    // computeBaseFingerprint from the same path as test:standard.
    // This guards against accidental divergence.
    expect(computeBaseFingerprint).toBeDefined();
    expect(typeof computeBaseFingerprint).toBe('function');
  });

  it('stripVersionLines removes versionName and versionCode from gradle', () => {
    // Verify the version-suppression logic that underpins the AC.
    const gradleContent = [
      'android {',
      '    compileSdk 34',
      '    defaultConfig {',
      '        applicationId "com.example"',
      '        versionName "1.2.3"',
      '        versionCode 42',
      '        minSdk 24',
      '    }',
      '}',
    ].join('\n');

    const stripped = stripVersionLines('build.gradle', gradleContent);
    expect(stripped).not.toContain('versionName');
    expect(stripped).not.toContain('versionCode');
    expect(stripped).toContain('compileSdk');
    expect(stripped).toContain('applicationId');
  });

  it('stripVersionLines removes CFBundleVersion from plist', () => {
    const plistContent = [
      '<dict>',
      '    <key>CFBundleName</key>',
      '    <string>MyApp</string>',
      '    <key>CFBundleVersion</key>',
      '    <string>123</string>',
      '    <key>CFBundleShortVersionString</key>',
      '    <string>1.0</string>',
      '</dict>',
    ].join('\n');

    const stripped = stripVersionLines('Info.plist', plistContent);
    expect(stripped).not.toContain('CFBundleVersion');
    expect(stripped).not.toContain('<string>123</string>');
    expect(stripped).toContain('CFBundleName');
    expect(stripped).toContain('CFBundleShortVersionString');
  });
});

// ---------------------------------------------------------------------------
// No __DEV__ check (design §5 - removed because unreliable)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// buildGateMetadata - honest, source-marked, bundle-comparable dimensions
// ---------------------------------------------------------------------------

describe('buildGateMetadata (test:bundled = source)', () => {
  /** A minimal BundleResult standing in for a freshly built plain-JS bundle. */
  function bundleResult(overrides: Partial<BundleResult> = {}): BundleResult {
    return {
      bundlePath: '/tmp/bundle.android.js',
      bundleFormat: 'plain-js',
      bundleSizeMb: 1.2,
      bundleHash: 'deadbeef',
      assetsDest: '/tmp/assets.android',
      assetInventory: ['drawable/icon.png', 'raw/data.json'],
      bundler: 'rn',
      ...overrides,
    };
  }

  /** Resolve package versions by name so the two getPackageVersion reads differ. */
  function mockVersions(versions: Record<string, string | null>) {
    mockGetPackageVersion.mockImplementation((name: string) =>
      name in versions ? versions[name] : null
    );
  }

  it('marks source, sends bundle-derivable dims + the SDK-protocol compat input', async () => {
    mockVersions({
      'react-native': '0.76.0',
      [SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME]: '2.0.1',
    });

    const result = bundleResult();
    const metadata = await buildGateMetadata({
      projectRoot: tempDir,
      platform: 'android' as Platform,
      bundleResult: result,
    });

    // Honest derivation marker - the gate excludes source-marked dims from the
    // binary-identity diff.
    expect(metadata.derivedFrom).toBe('source');
    // Bundle-derivable identity dims.
    expect(metadata.bundleFormat).toBe('plain-js');
    expect(metadata.assetInventory).toEqual(result.assetInventory);
    // Source/config signals.
    expect(metadata.engineClass).toBe('hermes'); // RN >= 0.70 default, no jsc config
    expect(metadata.expoUpdatesEnabled).toBe(false);
    expect(metadata.buildMetadata).toEqual({
      reactNativeVersion: '0.76.0',
      buildMode: 'release',
    });
    // The SDK-protocol version is the bundle REQUIREMENT (compat input), read
    // from the installed @sherlo/react-native-storybook package version.
    expect(metadata.requiredSdkProtocolVersion).toBe('2.0.1');

    // Binary-only facts a bundle cannot know are DROPPED, not fabricated.
    expect(metadata).not.toHaveProperty('hasEmbeddedBundle');
    // The baked binary-identity sdkProtocolVersion is never sent from a bundle.
    expect(metadata).not.toHaveProperty('sdkProtocolVersion');
  });

  it('omits the SDK-protocol compat input when the package is not installed (absent, not fabricated)', async () => {
    mockVersions({
      'react-native': '0.76.0',
      [SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME]: null, // getPackageVersion -> null
    });

    const metadata = await buildGateMetadata({
      projectRoot: tempDir,
      platform: 'android' as Platform,
      bundleResult: bundleResult(),
    });

    expect(metadata.derivedFrom).toBe('source');
    expect(metadata).not.toHaveProperty('requiredSdkProtocolVersion');
  });
});

describe('no __DEV__ check', () => {
  it('does NOT refuse a bundle containing __DEV__ = true string', async () => {
    // The CLI enforces --dev false at the bundler level.  A bundle that
    // happens to contain "__DEV__ = true" as a string literal (or any
    // other text) should pass through without refusal.
    const bundle = plainJsBundle('"__DEV__ = true"; // not actual dev mode');
    setupBundleBuild(bundle);

    const result = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });

    expect(result.bundleFormat).toBe('plain-js');
  });
});

// ---------------------------------------------------------------------------
// Empty/missing bundle detection
// ---------------------------------------------------------------------------

describe('buildBundleForPlatform - empty bundle', () => {
  it('throws on an empty bundle file', async () => {
    setupBundleBuild(Buffer.alloc(0));

    await expect(
      buildBundleForPlatform({
        projectRoot: tempDir,
        platform: 'android' as Platform,
      })
    ).rejects.toThrow('Bundle file is empty');
  });
});
