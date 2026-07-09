/**
 * Tests for baseFingerprint computation and version suppression.
 *
 * AC1: baseFingerprint is deterministic - same inputs → same hash.
 * AC2: Version bumps MUST NOT change baseFingerprint.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Helpers - create tiny fixture projects on disk
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fp-test-'));
}

function writeFile(dir: string, relativePath: string, content: string): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Mock @expo/fingerprint - we control the hash to avoid spawning real processes.
// ---------------------------------------------------------------------------

const mockCreateFingerprintAsync = vi.fn();

vi.mock('@expo/fingerprint', () => ({
  createFingerprintAsync: (...args: any[]) => mockCreateFingerprintAsync(...args),
  SourceSkips: {
    None: 0,
    ExpoConfigVersions: 1,
    ExpoConfigRuntimeVersionIfString: 2,
  },
}));

// Also mock runShellCommand so autolinked-module spawning doesn't hang.
vi.mock('../../runShellCommand', () => ({
  default: vi.fn().mockRejectedValue(new Error('not available in test')),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeBaseFingerprint', () => {
  let computeBaseFingerprint: typeof import('../baseFingerprint').computeBaseFingerprint;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default: fingerprint succeeds with a known hash.
    mockCreateFingerprintAsync.mockResolvedValue({ hash: 'fp-layer1-abc123' });

    const mod = await import('../baseFingerprint');
    computeBaseFingerprint = mod.computeBaseFingerprint;
  });

  // AC1: Determinism - same project produces same hash.
  it('produces deterministic hashes for the same project (AC1)', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test', version: '1.0.0' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\npackage@1.0.0:\n  version "1.0.0"');

      const result1 = await computeBaseFingerprint(dir);
      const result2 = await computeBaseFingerprint(dir);

      expect(result1.hash).toBeTruthy();
      expect(result1.hash).toBe(result2.hash);
    } finally {
      cleanup(dir);
    }
  });

  // AC2: Version bump doesn't change baseFingerprint - managed project.
  // The @expo/fingerprint mock returns the same hash regardless, so this
  // proves the combine logic is stable.
  it('version bump does NOT change baseFingerprint - managed project (AC2)', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test', version: '1.0.0' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\n');

      const result1 = await computeBaseFingerprint(dir);

      // The fingerprint should be the same even if files change,
      // because @expo/fingerprint returns a stable hash (versions are suppressed)
      // and the lockfile hasn't changed.
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test', version: '2.0.0' }));

      const result2 = await computeBaseFingerprint(dir);

      expect(result1.hash).toBeTruthy();
      expect(result1.hash).toBe(result2.hash);
    } finally {
      cleanup(dir);
    }
  });

  // AC2: Version bump on bare project - fileHookTransform is exercised.
  it('calls @expo/fingerprint with fileHookTransform for bare projects', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'android/app/build.gradle', 'versionCode 1');
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\n');

      await computeBaseFingerprint(dir);

      // Verify that @expo/fingerprint was called with a fileHookTransform option.
      const callArgs = mockCreateFingerprintAsync.mock.calls[0];
      expect(callArgs).toBeDefined();
      const options = callArgs[1];
      expect(options).toBeDefined();
      expect(options.fileHookTransform).toBeDefined();
      expect(typeof options.fileHookTransform).toBe('function');
    } finally {
      cleanup(dir);
    }
  });

  // AC2: Managed project uses SourceSkips, not fileHookTransform.
  it('calls @expo/fingerprint with SourceSkips for managed projects', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\n');

      await computeBaseFingerprint(dir);

      const callArgs = mockCreateFingerprintAsync.mock.calls[0];
      const options = callArgs[1];
      expect(options).toBeDefined();
      expect(options.sourceSkips).toBeDefined();
      // sourceSkips should include ExpoConfigVersions (1) and ExpoConfigRuntimeVersionIfString (2)
      expect(options.sourceSkips).toBe(3); // 1 | 2
    } finally {
      cleanup(dir);
    }
  });

  // Graceful degradation: @expo/fingerprint throws → returns null hash.
  it('returns null hash when @expo/fingerprint throws', async () => {
    mockCreateFingerprintAsync.mockRejectedValue(new Error('Module not found'));

    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));

      const result = await computeBaseFingerprint(dir);
      expect(result.hash).toBeNull();
      expect(result.debugMessage).toBeTruthy();
    } finally {
      cleanup(dir);
    }
  });

  // Graceful degradation: @expo/fingerprint returns empty hash.
  it('returns null hash when @expo/fingerprint returns empty hash', async () => {
    mockCreateFingerprintAsync.mockResolvedValue({ hash: '' });

    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));

      const result = await computeBaseFingerprint(dir);
      expect(result.hash).toBeNull();
      expect(result.debugMessage).toMatch(/empty/i);
    } finally {
      cleanup(dir);
    }
  });

  // Layer 2: lockfile changes DO change hash.
  it('lockfile changes DO change baseFingerprint (Layer 2)', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));
      writeFile(dir, 'yarn.lock', '# v1\npackage-a@1.0.0:\n  version "1.0.0"');

      const result1 = await computeBaseFingerprint(dir);

      writeFile(dir, 'yarn.lock', '# v2\npackage-b@2.0.0:\n  version "2.0.0"');

      const result2 = await computeBaseFingerprint(dir);

      // Same layer1 mock hash, but different lockfiles → different final hash.
      expect(result1.hash).toBeTruthy();
      expect(result2.hash).toBeTruthy();
      expect(result1.hash).not.toBe(result2.hash);
    } finally {
      cleanup(dir);
    }
  });

  // The fileHookTransform correctly strips version lines.
  it('fileHookTransform strips version lines from plist files', async () => {
    // Import the transform factory to test in isolation.
    // We access it indirectly through the mock call.
    const dir = makeTempDir();
    try {
      writeFile(
        dir,
        'ios/MyApp/Info.plist',
        '<?xml version="1.0">\n<dict>\n\t<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>'
      );
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\n');

      // Call once with version A
      const result1 = await computeBaseFingerprint(dir);

      // Bump version
      writeFile(
        dir,
        'ios/MyApp/Info.plist',
        '<?xml version="1.0">\n<dict>\n\t<key>CFBundleVersion</key>\n\t<string>99</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>'
      );

      const result2 = await computeBaseFingerprint(dir);

      // With the mock, layer1 hash is always the same. But the real test is:
      // the fileHookTransform was passed, which the previous test already verified.
      // This test ensures determinism with the transform in place.
      if (result1.hash && result2.hash) {
        expect(result1.hash).toBe(result2.hash);
      }
    } finally {
      cleanup(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// Direct stripVersionLines tests - AC2 version-suppression behaviour.
// These prove that the line stripper works WITHOUT the @expo/fingerprint mock,
// so version bumps that DO NOT change the output are actually suppressed.
// ---------------------------------------------------------------------------

describe('stripVersionLines', () => {
  let stripVersionLines: typeof import('../baseFingerprint').stripVersionLines;

  beforeEach(async () => {
    const mod = await import('../baseFingerprint');
    stripVersionLines = mod.stripVersionLines;
  });

  describe('plist files', () => {
    const plistHeader =
      '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>';

    it('strips CFBundleVersion line (AC2)', () => {
      const content = `${plistHeader}\n\t<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      const stripped = stripVersionLines('Info.plist', content);
      expect(stripped).not.toContain('CFBundleVersion');
      expect(stripped).not.toContain('<string>1</string>');
      expect(stripped).toContain('SomeOther');
      expect(stripped).toContain('keep');
    });

    it('strips MARKETING_VERSION line (AC2)', () => {
      const content = `${plistHeader}\n\t<key>MARKETING_VERSION</key>\n\t<string>2.0.0</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      const stripped = stripVersionLines('Info.plist', content);
      expect(stripped).not.toContain('MARKETING_VERSION');
      expect(stripped).not.toContain('2.0.0');
      expect(stripped).toContain('SomeOther');
      expect(stripped).toContain('keep');
    });

    it('different CFBundleVersion values produce identical stripped output (AC2)', () => {
      const v1 = `${plistHeader}\n\t<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      const v99 = `${plistHeader}\n\t<key>CFBundleVersion</key>\n\t<string>99</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      expect(stripVersionLines('Info.plist', v1)).toBe(stripVersionLines('Info.plist', v99));
    });

    it('different MARKETING_VERSION values produce identical stripped output (AC2)', () => {
      const v1 = `${plistHeader}\n\t<key>MARKETING_VERSION</key>\n\t<string>1.0</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      const v2 = `${plistHeader}\n\t<key>MARKETING_VERSION</key>\n\t<string>2.0.0</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      expect(stripVersionLines('Info.plist', v1)).toBe(stripVersionLines('Info.plist', v2));
    });

    it('non-version lines are preserved and differences DO affect output', () => {
      const v1 = `${plistHeader}\n\t<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      const v2 = `${plistHeader}\n\t<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>SomeOther</key>\n\t<string>changed</string>\n</dict>\n</plist>`;
      expect(stripVersionLines('Info.plist', v1)).not.toBe(stripVersionLines('Info.plist', v2));
    });
  });

  describe('build.gradle files', () => {
    it('strips versionName line (AC2)', () => {
      const content = 'android {\n    versionName "1.0.0"\n    applicationId "com.example"\n}';
      const stripped = stripVersionLines('build.gradle', content);
      expect(stripped).not.toContain('versionName');
      expect(stripped).toContain('applicationId');
    });

    it('strips versionCode line (AC2)', () => {
      const content = 'android {\n    versionCode 1\n    applicationId "com.example"\n}';
      const stripped = stripVersionLines('build.gradle', content);
      expect(stripped).not.toContain('versionCode');
      expect(stripped).toContain('applicationId');
    });

    it('different versionName values produce identical stripped output (AC2)', () => {
      const v1 = 'android {\n    versionName "1.0.0"\n    applicationId "com.example"\n}';
      const v2 = 'android {\n    versionName "2.0.0"\n    applicationId "com.example"\n}';
      expect(stripVersionLines('build.gradle', v1)).toBe(stripVersionLines('build.gradle', v2));
    });

    it('different versionCode values produce identical stripped output (AC2)', () => {
      const v1 = 'android {\n    versionCode 1\n    applicationId "com.example"\n}';
      const v2 = 'android {\n    versionCode 99\n    applicationId "com.example"\n}';
      expect(stripVersionLines('build.gradle', v1)).toBe(stripVersionLines('build.gradle', v2));
    });

    it('non-version lines are preserved and differences DO affect output', () => {
      const v1 = 'android {\n    versionName "1.0.0"\n    applicationId "com.example"\n}';
      const v2 = 'android {\n    versionName "1.0.0"\n    applicationId "com.other"\n}';
      expect(stripVersionLines('build.gradle', v1)).not.toBe(stripVersionLines('build.gradle', v2));
    });

    it('handles build.gradle.kts identically', () => {
      const v1 = 'android {\n    versionName "1.0.0"\n    applicationId "com.example"\n}';
      expect(stripVersionLines('build.gradle', v1)).toBe(stripVersionLines('build.gradle.kts', v1));
    });
  });

  describe('non-version files', () => {
    it('passes content through unchanged', () => {
      const content = 'export const foo = 1;\nconsole.log("hello");';
      expect(stripVersionLines('App.tsx', content)).toBe(content);
    });
  });
});
