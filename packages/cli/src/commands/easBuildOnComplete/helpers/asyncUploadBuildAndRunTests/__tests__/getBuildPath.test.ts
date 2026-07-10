/**
 * Unit tests for getBuildPath.
 *
 * getBuildPath resolves the on-disk build artifact for a platform:
 *  - it reads `eas.json` (relative to getCwd()) for a profile's
 *    `applicationArchivePath` override, and
 *  - falls back to the Android default apk path or an iOS `*.app` scan.
 *
 * We drive it with real fs fixtures in a tmp dir and point the process cwd at
 * that dir (getCwd() === process.cwd()), so both the eas.json lookup AND the
 * relative default-path existence checks resolve inside the fixture.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import getBuildPath from '../getBuildPath';

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-getbuildpath-'));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixture helpers (all paths relative to tmpDir == cwd)
// ---------------------------------------------------------------------------

function writeEasJson(content: object) {
  fs.writeFileSync(path.join(tmpDir, 'eas.json'), JSON.stringify(content, null, 2));
}

function touch(relativePath: string) {
  const full = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, '');
}

function mkdirp(relativePath: string) {
  fs.mkdirSync(path.join(tmpDir, relativePath), { recursive: true });
}

const ANDROID_DEFAULT = 'android/app/build/outputs/apk/release/app-release.apk';
const IOS_SCAN_DIR = 'ios/build/Build/Products/Release-iphonesimulator';

// ---------------------------------------------------------------------------
// Android
// ---------------------------------------------------------------------------

describe('getBuildPath - android', () => {
  it('uses the profile applicationArchivePath override from eas.json', () => {
    writeEasJson({
      builds: { android: { preview: { applicationArchivePath: 'custom/out/my-app.apk' } } },
    });
    touch('custom/out/my-app.apk');

    expect(getBuildPath({ easBuildProfile: 'preview', platform: 'android' as any })).toBe(
      'custom/out/my-app.apk'
    );
  });

  it('falls back to the default apk path when the profile has no override', () => {
    // eas.json exists (it is always read) but carries no override for this profile.
    writeEasJson({ builds: { android: { preview: {} } } });
    touch(ANDROID_DEFAULT);

    expect(getBuildPath({ easBuildProfile: 'preview', platform: 'android' as any })).toBe(
      ANDROID_DEFAULT
    );
  });

  it('falls back to the default apk path when eas.json has no builds section', () => {
    writeEasJson({ cli: { version: '>= 5.0.0' } });
    touch(ANDROID_DEFAULT);

    expect(getBuildPath({ easBuildProfile: 'production', platform: 'android' as any })).toBe(
      ANDROID_DEFAULT
    );
  });

  it('throws when the resolved build file does not exist', () => {
    writeEasJson({ builds: { android: { preview: {} } } });
    // No apk written on disk.

    expect(() => getBuildPath({ easBuildProfile: 'preview', platform: 'android' as any })).toThrow(
      'Build file does not exist at path'
    );
  });
});

// ---------------------------------------------------------------------------
// iOS
// ---------------------------------------------------------------------------

describe('getBuildPath - ios', () => {
  it('uses the profile applicationArchivePath override from eas.json', () => {
    writeEasJson({
      builds: { ios: { preview: { applicationArchivePath: 'custom/out/MyApp.app' } } },
    });
    mkdirp('custom/out/MyApp.app');

    expect(getBuildPath({ easBuildProfile: 'preview', platform: 'ios' as any })).toBe(
      'custom/out/MyApp.app'
    );
  });

  it('scans the default iphonesimulator dir for a *.app when no override is set', () => {
    writeEasJson({ builds: { ios: { preview: {} } } });
    mkdirp(path.join(IOS_SCAN_DIR, 'MyApp.app'));

    expect(getBuildPath({ easBuildProfile: 'preview', platform: 'ios' as any })).toBe(
      path.join(IOS_SCAN_DIR, 'MyApp.app')
    );
  });

  it('throws when neither an override nor a scanned *.app exists', () => {
    writeEasJson({ builds: { ios: { preview: {} } } });
    // The scan dir does not exist -> findDefaultIosAppPath returns null.

    expect(() => getBuildPath({ easBuildProfile: 'preview', platform: 'ios' as any })).toThrow(
      'Could not find build path for platform: ios'
    );
  });

  it('throws when the scan dir exists but contains no *.app', () => {
    writeEasJson({ builds: { ios: { preview: {} } } });
    mkdirp(IOS_SCAN_DIR);
    touch(path.join(IOS_SCAN_DIR, 'not-an-app.txt'));

    expect(() => getBuildPath({ easBuildProfile: 'preview', platform: 'ios' as any })).toThrow(
      'Could not find build path for platform: ios'
    );
  });
});

// ---------------------------------------------------------------------------
// eas.json validity + unsupported platform
// ---------------------------------------------------------------------------

describe('getBuildPath - error cases', () => {
  it('throws an "Invalid" message when eas.json is malformed JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'eas.json'), '{ not valid json');

    expect(() => getBuildPath({ easBuildProfile: 'preview', platform: 'android' as any })).toThrow(
      'Invalid'
    );
  });

  it('throws an "Invalid" message when eas.json is missing entirely', () => {
    // getBuildPathFromEasJson reads eas.json unconditionally.
    expect(() => getBuildPath({ easBuildProfile: 'preview', platform: 'android' as any })).toThrow(
      'Invalid'
    );
  });

  it('throws for an unsupported platform', () => {
    expect(() => getBuildPath({ easBuildProfile: 'preview', platform: 'windows' as any })).toThrow(
      'Unsupported platform: windows'
    );
  });
});
