/**
 * Unit tests for getBuildPath (sherlo / Cloud builds on EAS, "What does the hook do?").
 *
 * getBuildPath finds the app build an EAS build left, the way EAS itself finds it:
 *  - a profile's `applicationArchivePath` in eas.json (`build.<profile>.<platform>`), which may be a
 *    path or a pattern, and
 *  - EAS's own default pattern for the build Sherlo asks for when the profile names none: an APK
 *    under the Android outputs, a simulator app under any `*-iphonesimulator` products folder.
 *
 * We drive it with real fs fixtures in a tmp dir and point the process cwd at that dir
 * (getCwd() === process.cwd()), so the eas.json lookup and the pattern both resolve inside it.
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

const ANDROID_RELEASE_APK = 'android/app/build/outputs/apk/release/app-release.apk';

// ---------------------------------------------------------------------------
// The profile's own archive path
// ---------------------------------------------------------------------------

describe('getBuildPath - the profile names the archive', () => {
  it("reads a profile's applicationArchivePath where eas.json keeps it, under the profile and then the platform", () => {
    writeEasJson({
      build: { sherlo: { android: { applicationArchivePath: 'custom/out/my-app.apk' } } },
    });
    touch('custom/out/my-app.apk');

    expect(getBuildPath({ easBuildProfile: 'sherlo', platform: 'android' })).toBe(
      'custom/out/my-app.apk'
    );
  });

  it("matches a profile's applicationArchivePath as a pattern, as EAS does", () => {
    writeEasJson({ build: { sherlo: { ios: { applicationArchivePath: 'custom/**/*.app' } } } });
    mkdirp('custom/out/Debug-iphonesimulator/MyApp.app');

    expect(getBuildPath({ easBuildProfile: 'sherlo', platform: 'ios' })).toBe(
      'custom/out/Debug-iphonesimulator/MyApp.app'
    );
  });
});

// ---------------------------------------------------------------------------
// EAS's own default patterns
// ---------------------------------------------------------------------------

describe("getBuildPath - EAS's default", () => {
  it('falls back to the APK under the Android build outputs when the profile has no override', () => {
    writeEasJson({ build: { sherlo: { android: {} } } });
    touch(ANDROID_RELEASE_APK);

    expect(getBuildPath({ easBuildProfile: 'sherlo', platform: 'android' })).toBe(
      ANDROID_RELEASE_APK
    );
  });

  it("finds the iOS simulator app in any configuration's -iphonesimulator folder when no override is set", () => {
    writeEasJson({ build: { sherlo: { ios: {} } } });
    mkdirp('ios/build/Build/Products/Debug-iphonesimulator/MyApp.app');

    expect(getBuildPath({ easBuildProfile: 'sherlo', platform: 'ios' })).toBe(
      'ios/build/Build/Products/Debug-iphonesimulator/MyApp.app'
    );
  });

  it('throws when nothing matches the archive pattern, naming the pattern', () => {
    writeEasJson({ build: { sherlo: { ios: {} } } });
    mkdirp('ios/build/Build/Products/Release-iphonesimulator');
    touch('ios/build/Build/Products/Release-iphonesimulator/not-an-app.txt');

    expect(() => getBuildPath({ easBuildProfile: 'sherlo', platform: 'ios' })).toThrow(
      'Build file does not exist at path: ios/build/Build/Products/*-iphonesimulator/*.app'
    );
  });
});

// ---------------------------------------------------------------------------
// eas.json validity + unsupported platform
// ---------------------------------------------------------------------------

describe('getBuildPath - error cases', () => {
  it('throws an "Invalid" message when eas.json is malformed JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'eas.json'), '{ not valid json');

    expect(() => getBuildPath({ easBuildProfile: 'sherlo', platform: 'android' })).toThrow(
      'Invalid'
    );
  });

  it('throws an "Invalid" message when eas.json is missing entirely', () => {
    expect(() => getBuildPath({ easBuildProfile: 'sherlo', platform: 'android' })).toThrow(
      'Invalid'
    );
  });

  it('throws for an unsupported platform', () => {
    expect(() => getBuildPath({ easBuildProfile: 'sherlo', platform: 'windows' as any })).toThrow(
      'Unsupported platform: windows'
    );
  });
});
