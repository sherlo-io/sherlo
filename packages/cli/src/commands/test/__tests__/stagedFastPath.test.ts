/**
 * Staged fast-path guarantee (SHERLO-1707 / SHERLO-1688).
 *
 * A staged run resolves "fast" only when its base fingerprint matches the
 * registered base. The whole point of `baseFingerprint` is that a pure
 * version / build-number bump (CFBundleVersion, MARKETING_VERSION, versionName,
 * versionCode) must NOT change it - otherwise a routine version bump would kick
 * every JS-only change onto the slow full-build path.
 *
 * These tests pin that invariance at two levels:
 *   1. The version-stripping transform itself (stripVersionLines).
 *   2. computeBaseFingerprint end-to-end, with the @expo/fingerprint layer
 *      wired to hash the TRANSFORMED file content so the transform actually
 *      participates in the result.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-staged-fp-'));
}

function writeFile(dir: string, relativePath: string, content: string): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

const GRADLE_V1 =
  'android {\n    defaultConfig {\n        applicationId "com.example"\n        versionCode 1\n        versionName "1.0.0"\n    }\n}';
const GRADLE_V2 =
  'android {\n    defaultConfig {\n        applicationId "com.example"\n        versionCode 42\n        versionName "9.9.9"\n    }\n}';

// ---------------------------------------------------------------------------
// @expo/fingerprint mock - runs the provided fileHookTransform over the bare
// project's build.gradle and hashes the TRANSFORMED bytes. This makes the mock
// result depend on version stripping: if stripping were removed, a versionCode
// bump would change the hash and this test would fail.
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

// Keep autolinked-module resolution from spawning real processes.
vi.mock('../../../helpers/runShellCommand', () => ({
  default: vi.fn().mockRejectedValue(new Error('not available in test')),
}));

/**
 * Drive a fileHookTransform the way baseFingerprint does: feed the whole file as
 * one chunk, then an end-of-file marker, and concatenate the returned content.
 */
function runTransform(transform: any, filePath: string, content: string): string {
  const source = { type: 'file', filePath } as const;
  let out = '';
  const mid = transform(source, content, false, 'utf8');
  if (mid) out += typeof mid === 'string' ? mid : mid.toString('utf8');
  const end = transform(source, null, true, 'utf8');
  if (end) out += typeof end === 'string' ? end : end.toString('utf8');
  return out;
}

describe('staged fast path - version/build-number bump keeps the base identical', () => {
  let computeBaseFingerprint: typeof import('../../../helpers/fingerprint').computeBaseFingerprint;
  let stripVersionLines: typeof import('../../../helpers/fingerprint/baseFingerprint').stripVersionLines;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Hash the version-stripped build.gradle so the mock reflects stripping.
    mockCreateFingerprintAsync.mockImplementation(async (projectRoot: string, options: any) => {
      const gradlePath = path.join(projectRoot, 'android/app/build.gradle');
      let content = '';
      try {
        content = fs.readFileSync(gradlePath, 'utf8');
      } catch {
        /* no gradle - hash empty */
      }
      const transformed = options?.fileHookTransform
        ? runTransform(options.fileHookTransform, gradlePath, content)
        : content;
      return { hash: crypto.createHash('sha256').update(transformed).digest('hex') };
    });

    const fpMod = await import('../../../helpers/fingerprint');
    computeBaseFingerprint = fpMod.computeBaseFingerprint;
    const baseMod = await import('../../../helpers/fingerprint/baseFingerprint');
    stripVersionLines = baseMod.stripVersionLines;
  });

  // Level 1: the transform is version-invariant for gradle + plist.
  it('stripVersionLines produces identical output across a gradle version bump', () => {
    expect(stripVersionLines('android/app/build.gradle', GRADLE_V1)).toBe(
      stripVersionLines('android/app/build.gradle', GRADLE_V2)
    );
  });

  it('stripVersionLines produces identical output across a plist CFBundleVersion bump', () => {
    const plistV1 =
      '<dict>\n\t<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>Keep</key>\n\t<string>x</string>\n</dict>';
    const plistV99 =
      '<dict>\n\t<key>CFBundleVersion</key>\n\t<string>99</string>\n\t<key>Keep</key>\n\t<string>x</string>\n</dict>';
    expect(stripVersionLines('ios/App/Info.plist', plistV1)).toBe(
      stripVersionLines('ios/App/Info.plist', plistV99)
    );
  });

  // Level 2: computeBaseFingerprint end-to-end is invariant to the bump, so the
  // staged gate resolves fast (base matches) instead of forcing a full build.
  it('computeBaseFingerprint is unchanged by a versionCode/versionName-only bump', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'app', version: '1.0.0' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\n');
      writeFile(dir, 'android/app/build.gradle', GRADLE_V1);

      const before = await computeBaseFingerprint(dir);

      // Pure build-number / version bump - nothing else changes.
      writeFile(dir, 'android/app/build.gradle', GRADLE_V2);

      const after = await computeBaseFingerprint(dir);

      expect(before.hash).toBeTruthy();
      expect(after.hash).toBe(before.hash);
    } finally {
      cleanup(dir);
    }
  });

  it('computeBaseFingerprint DOES change for a non-version native edit (sanity)', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'app', version: '1.0.0' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\n');
      writeFile(dir, 'android/app/build.gradle', GRADLE_V1);

      const before = await computeBaseFingerprint(dir);

      // A real native change (new applicationId) is NOT a version bump - the
      // base must change so the gate correctly refuses the fast path.
      writeFile(
        dir,
        'android/app/build.gradle',
        GRADLE_V1.replace('com.example', 'com.example.renamed')
      );

      const after = await computeBaseFingerprint(dir);

      expect(after.hash).not.toBe(before.hash);
    } finally {
      cleanup(dir);
    }
  });
});
