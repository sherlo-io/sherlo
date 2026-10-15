import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, afterEach } from 'vitest';

import detectBundler, { detectEntryFile } from '..';
import parseAndroidBundleCommand from '../parseAndroidBundleCommand';
import parseIosBundleCommand from '../parseIosBundleCommand';

const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-detect-bundler-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }
});

function writeJson(dir: string, filename: string, content: object) {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(content));
}

describe('detectEntryFile', () => {
  it('reads main from package.json when present', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { main: 'index.ts' });
    expect(detectEntryFile(dir)).toBe('index.ts');
  });

  it('falls back to index.js when main is absent', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { dependencies: {} });
    expect(detectEntryFile(dir)).toBe('index.js');
  });

  it('falls back to index.js when package.json missing', () => {
    const dir = makeTempDir();
    expect(detectEntryFile(dir)).toBe('index.js');
  });

  it('falls back to index.js when main is empty string', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { main: '' });
    expect(detectEntryFile(dir)).toBe('index.js');
  });
});

const EXPO_PBXPROJ = `/* Begin PBXShellScriptBuildPhase section */
    A1 /* Bundle React Native code and images */ = {
        isa = PBXShellScriptBuildPhase;
        shellScript = "export BUNDLE_COMMAND=\\"export:embed\\"\\nexport CLI_PATH=\\"../node_modules/@expo/cli/build/src/cli.js\\"\\n";
    };
/* End PBXShellScriptBuildPhase section */`;

const RN_PBXPROJ = `/* Begin PBXShellScriptBuildPhase section */
    A2 /* Bundle React Native code and images */ = {
        isa = PBXShellScriptBuildPhase;
        shellScript = "export NODE_BINARY=node\\n../node_modules/react-native/scripts/react-native-xcode.sh";
    };
/* End PBXShellScriptBuildPhase section */`;

const EXPO_GRADLE = `android { }\nreact {\n  bundleCommand = "export:embed"\n  entryFile = "index.js"\n}`;
const RN_GRADLE = `android { }\nreact {\n  entryFile = "index.js"\n}`;
const RN_GRADLE_LEGACY = `android { }\n// no react block`;

function makeIosProject(dir: string, pbxprojContent: string): void {
  const xcodeprojDir = path.join(dir, 'ios', 'TestApp.xcodeproj');
  fs.mkdirSync(xcodeprojDir, { recursive: true });
  fs.writeFileSync(path.join(xcodeprojDir, 'project.pbxproj'), pbxprojContent);
}

function makeAndroidProject(dir: string, gradleContent: string): void {
  const appDir = path.join(dir, 'android', 'app');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'build.gradle'), gradleContent);
}

describe('parseIosBundleCommand', () => {
  it('returns expo from BUNDLE_COMMAND=export:embed in pbxproj', () => {
    const dir = makeTempDir();
    makeIosProject(dir, EXPO_PBXPROJ);
    expect(parseIosBundleCommand(dir)).toBe('expo');
  });

  it('returns rn from react-native-xcode.sh in pbxproj', () => {
    const dir = makeTempDir();
    makeIosProject(dir, RN_PBXPROJ);
    expect(parseIosBundleCommand(dir)).toBe('rn');
  });

  it('returns null when ios dir missing', () => {
    const dir = makeTempDir();
    expect(parseIosBundleCommand(dir)).toBeNull();
  });
});

describe('parseAndroidBundleCommand', () => {
  it('returns expo from bundleCommand = "export:embed" in react block', () => {
    const dir = makeTempDir();
    makeAndroidProject(dir, EXPO_GRADLE);
    expect(parseAndroidBundleCommand(dir)).toBe('expo');
  });

  it('returns rn when react block has no bundleCommand', () => {
    const dir = makeTempDir();
    makeAndroidProject(dir, RN_GRADLE);
    expect(parseAndroidBundleCommand(dir)).toBe('rn');
  });

  it('returns rn when no react block at all (legacy bare RN)', () => {
    const dir = makeTempDir();
    makeAndroidProject(dir, RN_GRADLE_LEGACY);
    expect(parseAndroidBundleCommand(dir)).toBe('rn');
  });

  it('returns null when build.gradle missing', () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, 'android', 'app'), { recursive: true });
    expect(parseAndroidBundleCommand(dir)).toBeNull();
  });
});

describe('detectBundler', () => {
  it('returns expo when ios and android both signal expo', () => {
    const dir = makeTempDir();
    makeIosProject(dir, EXPO_PBXPROJ);
    makeAndroidProject(dir, EXPO_GRADLE);
    expect(detectBundler(dir)).toBe('expo');
  });

  it('returns rn when ios and android both signal rn', () => {
    const dir = makeTempDir();
    makeIosProject(dir, RN_PBXPROJ);
    makeAndroidProject(dir, RN_GRADLE);
    expect(detectBundler(dir)).toBe('rn');
  });

  it('throws when ios and android disagree', () => {
    const dir = makeTempDir();
    makeIosProject(dir, EXPO_PBXPROJ);
    makeAndroidProject(dir, RN_GRADLE);
    expect(() => detectBundler(dir)).toThrow('iOS and Android bundle commands disagree');
  });

  it('returns expo from ios alone', () => {
    const dir = makeTempDir();
    makeIosProject(dir, EXPO_PBXPROJ);
    expect(detectBundler(dir)).toBe('expo');
  });

  it('returns rn from ios alone', () => {
    const dir = makeTempDir();
    makeIosProject(dir, RN_PBXPROJ);
    expect(detectBundler(dir)).toBe('rn');
  });

  it('returns expo from android alone', () => {
    const dir = makeTempDir();
    makeAndroidProject(dir, EXPO_GRADLE);
    expect(detectBundler(dir)).toBe('expo');
  });

  it('returns rn from android alone', () => {
    const dir = makeTempDir();
    makeAndroidProject(dir, RN_GRADLE_LEGACY);
    expect(detectBundler(dir)).toBe('rn');
  });

  it('returns expo for managed Expo app (no native dirs, expo dep + app.config.js)', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { dependencies: { expo: '*', 'react-native': '*' } });
    fs.writeFileSync(path.join(dir, 'app.config.js'), 'module.exports = {};');
    expect(detectBundler(dir)).toBe('expo');
  });

  it('throws when no native dirs and project is not managed Expo', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { dependencies: { 'react-native': '*' } });
    expect(() => detectBundler(dir)).toThrow('Cannot determine bundler');
  });
});
