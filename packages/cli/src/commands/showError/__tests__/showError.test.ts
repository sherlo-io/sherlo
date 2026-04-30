import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return { ...actual, execSync: vi.fn() };
});

import * as childProcess from 'child_process';
import {
  detectPlatform,
  detectBundler,
  parseIosBundleCommand,
  parseAndroidBundleCommand,
  detectEntryFile,
  findSourceMap,
  buildSourceMaps,
  runMetroSymbolicate,
  symbolicateAllFrames,
  renderOutput,
  SLUG_REGEX,
  resolveApiBaseUrl,
  resolveShowErrorUrl,
  type ParsedFrame,
  type JsErrorJson,
} from '../showError';
import showError from '../showError';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-showerr-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
});

function writeJson(dir: string, filename: string, content: object) {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(content));
}

// ---------------------------------------------------------------------------
// detectEntryFile
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// detectPlatform — from frame file paths
// ---------------------------------------------------------------------------

describe('detectPlatform', () => {
  it('detects android from index.android.bundle', () => {
    expect(detectPlatform('index.android.bundle')).toBe('android');
  });

  it('detects android from /data/user/0/ path', () => {
    expect(detectPlatform('/data/user/0/com.app/files/.expo-internal/abc')).toBe('android');
  });

  it('detects android from data/data/ path', () => {
    expect(detectPlatform('data/data/com.app/files/bundle')).toBe('android');
  });

  it('detects ios from .jsbundle extension', () => {
    expect(detectPlatform('bundle-abc.jsbundle')).toBe('ios');
  });

  it('detects ios from CoreSimulator/Devices path', () => {
    expect(detectPlatform('CoreSimulator/Devices/UUID/data/app/bundle.js')).toBe('ios');
  });

  it('detects ios from Library/Application Support/.expo-internal path', () => {
    expect(detectPlatform('Library/Application Support/.expo-internal/bundle')).toBe('ios');
  });

  it('defaults to ios for ambiguous file paths', () => {
    expect(detectPlatform('unknown-bundle.js')).toBe('ios');
  });

  it('detects android from joined multi-frame paths', () => {
    const paths = ['src/App.tsx', '/data/user/0/com.app/bundle', 'src/utils.ts'].join('\n');
    expect(detectPlatform(paths)).toBe('android');
  });
});

// ---------------------------------------------------------------------------
// detectBundler / parseIosBundleCommand / parseAndroidBundleCommand
// ---------------------------------------------------------------------------

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
    expect(() => detectBundler(dir)).toThrow("iOS and Android bundle commands disagree");
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

// ---------------------------------------------------------------------------
// buildSourceMaps — expo fallback to bare-rn
// ---------------------------------------------------------------------------

describe('buildSourceMaps — expo fallback', () => {
  it('falls back to bare-rn bundler when expo build fails', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { main: 'index.js' });

    let callCount = 0;
    vi.spyOn(childProcess, 'execSync').mockImplementation((cmd: any) => {
      callCount++;
      const cmdStr = String(cmd);
      if (cmdStr.includes('expo export:embed')) {
        throw new Error('expo build failed');
      }
      if (cmdStr.includes('react-native bundle')) {
        const cacheDir = path.join(dir, '.sherlo-cache');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, 'bundle.ios.jsbundle.map'), '{}');
        return Buffer.from('');
      }
      return Buffer.from('');
    });

    const result = buildSourceMaps(dir, 'expo', 'ios');
    expect(result).toContain('bundle.ios.jsbundle.map');
    expect(callCount).toBe(2); // expo attempt + bare-rn fallback
  });

  it('expo fallback bare-rn command includes --reset-cache', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { main: 'index.js' });

    const capturedCmds: string[] = [];
    vi.spyOn(childProcess, 'execSync').mockImplementation((cmd: any) => {
      const cmdStr = String(cmd);
      capturedCmds.push(cmdStr);
      if (cmdStr.includes('expo export:embed')) {
        throw new Error('expo build failed');
      }
      if (cmdStr.includes('react-native bundle')) {
        const cacheDir = path.join(dir, '.sherlo-cache');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, 'bundle.android.jsbundle.map'), '{}');
      }
      return Buffer.from('');
    });

    buildSourceMaps(dir, 'expo', 'android');
    const rnCmd = capturedCmds.find(c => c.includes('react-native bundle'));
    expect(rnCmd).toContain('--reset-cache');
  });
});

// ---------------------------------------------------------------------------
// buildSourceMaps — bare-rn (rn) branch
// ---------------------------------------------------------------------------

describe('buildSourceMaps — rn branch', () => {
  it('rn branch command includes --reset-cache', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { main: 'index.js' });

    let capturedCmd = '';
    vi.spyOn(childProcess, 'execSync').mockImplementation((cmd: any) => {
      capturedCmd = String(cmd);
      if (capturedCmd.includes('react-native bundle')) {
        const cacheDir = path.join(dir, '.sherlo-cache');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, 'bundle.android.jsbundle.map'), '{}');
      }
      return Buffer.from('');
    });

    buildSourceMaps(dir, 'rn', 'android');
    expect(capturedCmd).toContain('--reset-cache');
  });

  it('rn branch error includes stderr output', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { main: 'index.js' });

    vi.spyOn(childProcess, 'execSync').mockImplementation(() => {
      const err: any = new Error('Command failed: npx react-native bundle');
      err.stderr = Buffer.from('Metro bundler error: cannot find module');
      throw err;
    });

    expect(() => buildSourceMaps(dir, 'rn', 'android')).toThrow('Metro bundler error: cannot find module');
  });
});

// ---------------------------------------------------------------------------
// findSourceMap — expo export:embed map preferred, hbc.map refused
// ---------------------------------------------------------------------------

describe('findSourceMap (expo)', () => {
  it('returns plain-JS .js.map when present in .sherlo-cache', () => {
    const dir = makeTempDir();
    const cacheDir = path.join(dir, '.sherlo-cache');
    fs.mkdirSync(cacheDir);
    const mapPath = path.join(cacheDir, 'bundle.ios.js.map');
    fs.writeFileSync(mapPath, '{}');
    expect(findSourceMap(dir, 'expo', 'ios')).toBe(mapPath);
  });

  it('throws when only a .hbc.map is found in dist (Hermes bytecode)', () => {
    const dir = makeTempDir();
    const distDir = path.join(dir, '.sherlo-cache', 'dist', '_expo', 'static', 'js', 'ios');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'bundle.hbc.map'), '{}');
    expect(() => findSourceMap(dir, 'expo', 'ios')).toThrow('Hermes bytecode source map');
  });

  it('returns dist map (with warning) when it is not a .hbc.map', () => {
    const dir = makeTempDir();
    const distDir = path.join(dir, '.sherlo-cache', 'dist', '_expo', 'static', 'js', 'android');
    fs.mkdirSync(distDir, { recursive: true });
    const mapPath = path.join(distDir, 'bundle.js.map');
    fs.writeFileSync(mapPath, '{}');
    expect(findSourceMap(dir, 'expo', 'android')).toBe(mapPath);
  });

  it('throws when no map found at all', () => {
    const dir = makeTempDir();
    expect(() => findSourceMap(dir, 'expo', 'ios')).toThrow('No source map found');
  });
});

// ---------------------------------------------------------------------------
// runMetroSymbolicate — structural tests (no real binary needed)
// ---------------------------------------------------------------------------

describe('runMetroSymbolicate', () => {
  it('returns empty array when no frame lines provided', () => {
    const result = runMetroSymbolicate([], '/any/path.map', process.cwd());
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// symbolicateAllFrames — structural tests (no real source map needed)
// ---------------------------------------------------------------------------

describe('symbolicateAllFrames', () => {
  it('returns frames unchanged and zero counts when no frame has location', () => {
    const frames: ParsedFrame[] = [
      { fnName: 'foo', file: null, line: null, col: null },
      { fnName: 'bar', file: null, line: null, col: null },
    ];
    const { frames: result, totalFrames, resolvedFrames } = symbolicateAllFrames(
      frames, '/any/path.map', process.cwd()
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(frames[0]);
    expect(totalFrames).toBe(0);
    expect(resolvedFrames).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// renderOutput — JSON consumer formatting
// ---------------------------------------------------------------------------

function makeFixture(overrides: Partial<JsErrorJson> = {}): JsErrorJson {
  return {
    name: 'TypeError',
    message: 'undefined is not an object',
    stack: [
      { fnName: 'render', file: 'bundle.js', line: 1, col: 500 },
    ],
    componentStack: [
      { fnName: 'CrashComponent', file: 'App.tsx', line: 7, col: 18 },
    ],
    digest: null,
    cause: null,
    hasExpo: false,
    // engine intentionally omitted to test defaulting
    ...overrides,
  };
}

describe('renderOutput', () => {
  it('never prints Component tree section even when componentStack is non-empty', () => {
    const output = renderOutput(makeFixture());
    expect(output).not.toContain('Component tree:');
  });

  it('renders stack trace section', () => {
    const output = renderOutput(makeFixture());
    expect(output).toContain('Stack trace:');
    expect(output).toContain('  at render (bundle.js:1:500)');
  });

  it('renders anonymous frame as <anonymous>', () => {
    const data = makeFixture({
      stack: [
        { fnName: 'l', file: null, line: null, col: null },
      ],
    });
    const output = renderOutput(data);
    expect(output).toContain('  at l (<anonymous>)');
  });

  it('omits stack trace section when stack is empty', () => {
    const output = renderOutput(makeFixture({ stack: [] }));
    expect(output).not.toContain('Stack trace:');
  });

  it('omits digest when null', () => {
    const output = renderOutput(makeFixture({ digest: null }));
    expect(output).not.toContain('Digest:');
  });

  it('includes digest when present', () => {
    const output = renderOutput(makeFixture({ digest: 'abc123' }));
    expect(output).toContain('Digest: abc123');
  });

  it('omits cause section when null', () => {
    const output = renderOutput(makeFixture({ cause: null }));
    expect(output).not.toContain('Caused by:');
  });

  it('renders cause section with header and frames', () => {
    const data = makeFixture({
      cause: {
        name: 'ReferenceError',
        message: 'x is not defined',
        stack: [{ fnName: 'init', file: 'setup.ts', line: 3, col: 10 }],
      },
    });
    const output = renderOutput(data);
    expect(output).toContain('Caused by: ReferenceError: x is not defined');
    expect(output).toContain('  at init (setup.ts:3:10)');
  });

  it('renders frame without col as file:line (no col)', () => {
    const data = makeFixture({
      stack: [{ fnName: 'foo', file: 'App.tsx', line: 10, col: null }],
    });
    const output = renderOutput(data);
    expect(output).toContain('  at foo (App.tsx:10)');
    expect(output).not.toMatch(/at foo \(App\.tsx:10:\)/);
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('error cases', () => {
  it('missing package.json: detectEntryFile falls back to index.js', () => {
    const emptyDir = makeTempDir();
    expect(detectEntryFile(emptyDir)).toBe('index.js');
  });
});

// ---------------------------------------------------------------------------
// Slug validation (SLUG_REGEX)
// ---------------------------------------------------------------------------

describe('SLUG_REGEX', () => {
  const valid = [
    'PsS5H1B1-30-android-1777491220857',
    'AAAAAAAA-0-ios-1000000000000',
    'aBcDeF12-999-android-9999999999999',
    '00000000-1-ios-1234567890123',
  ];
  const invalid = [
    '',
    'too-short',
    'PsS5H1B1-30-android',                       // missing timestamp
    'PsS5H1B1-30-android-177749122085',           // timestamp too short (12 digits)
    'PsS5H1B1-30-android-17774912208570',         // timestamp too long (14 digits)
    'PsS5H1B1-30-windows-1777491220857',          // invalid platform
    'PsS5H1B1!-30-android-1777491220857',         // non-alphanumeric in teamId
    'PsS5H1B1-30-android-177749122085a',          // non-numeric timestamp
    'PsS5H1B1--30-android-1777491220857',         // double dash
    'PsS5H1B1-30-Android-1777491220857',          // platform uppercase
    'PsS5H1B1X-30-android-1777491220857',         // teamId 9 chars
    'PsS5H1B-30-android-1777491220857',           // teamId 7 chars
  ];

  for (const s of valid) {
    it(`accepts valid slug: ${s}`, () => {
      expect(SLUG_REGEX.test(s)).toBe(true);
    });
  }

  for (const s of invalid) {
    it(`rejects invalid slug: "${s}"`, () => {
      expect(SLUG_REGEX.test(s)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// resolveApiBaseUrl / resolveShowErrorUrl
// ---------------------------------------------------------------------------

describe('resolveApiBaseUrl', () => {
  const ORIG = process.env.SHERLO_API_URL;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.SHERLO_API_URL;
    else process.env.SHERLO_API_URL = ORIG;
  });

  it('returns production base when SHERLO_API_URL is not set', () => {
    delete process.env.SHERLO_API_URL;
    expect(resolveApiBaseUrl()).toBe('https://api.sherlo.io');
  });

  it('strips /graphql suffix when SHERLO_API_URL is set', () => {
    process.env.SHERLO_API_URL = 'http://localhost:4000/graphql';
    expect(resolveApiBaseUrl()).toBe('http://localhost:4000');
  });

  it('leaves non-graphql URL unchanged', () => {
    process.env.SHERLO_API_URL = 'http://localhost:4000';
    expect(resolveApiBaseUrl()).toBe('http://localhost:4000');
  });
});

describe('resolveShowErrorUrl', () => {
  const ORIG = process.env.SHERLO_API_URL;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.SHERLO_API_URL;
    else process.env.SHERLO_API_URL = ORIG;
  });

  it('builds the correct URL from slug with default base', () => {
    delete process.env.SHERLO_API_URL;
    expect(resolveShowErrorUrl('PsS5H1B1-30-android-1777491220857'))
      .toBe('https://api.sherlo.io/v1/show-error/PsS5H1B1-30-android-1777491220857');
  });

  it('builds URL using SHERLO_API_URL override (local dev)', () => {
    process.env.SHERLO_API_URL = 'http://localhost:4000/graphql';
    expect(resolveShowErrorUrl('PsS5H1B1-30-ios-1777491220857'))
      .toBe('http://localhost:4000/v1/show-error/PsS5H1B1-30-ios-1777491220857');
  });
});

// ---------------------------------------------------------------------------
// showError default export — process.exitCode instead of process.exit
// ---------------------------------------------------------------------------

const VALID_SLUG = 'PsS5H1B1-30-android-1777491220857';

describe('showError — exit behaviour on error', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: number | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = undefined as any;
    // Ensure process.exit is not called — spy that throws so any accidental call is caught
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => {
      throw new Error(`process.exit(${_code}) was called but should not have been`);
    });
  });

  it('sets process.exitCode=1 and returns (no process.exit) for invalid slug', async () => {
    await showError('not-a-valid-slug');

    expect(process.exitCode).toBe(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('sets process.exitCode=1 and returns (no process.exit) when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    await showError(VALID_SLUG);

    expect(process.exitCode).toBe(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('sets process.exitCode=1 with "No JS error found" message on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404, ok: false }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await showError(VALID_SLUG);

    expect(process.exitCode).toBe(1);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining(`No JS error found for build ${VALID_SLUG}`));
  });

  it('sets process.exitCode=1 and returns (no process.exit) when detectBundler fails', async () => {
    const mockPayload = {
      name: 'TypeError',
      message: 'oops',
      stack: [{ fnName: 'f', file: '/data/user/0/bundle.js', line: 1, col: 1 }],
      componentStack: [],
      digest: null,
      cause: null,
      hasExpo: false,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(mockPayload)),
    }));
    // detectBundler will throw because the cwd has no native dirs and no expo markers
    const emptyDir = makeTempDir();
    const origCwd = process.cwd;
    vi.spyOn(process, 'cwd').mockReturnValue(emptyDir);
    // make sure detectBundler throws (no native dirs, no expo config)
    writeJson(emptyDir, 'package.json', { dependencies: { 'react-native': '*' } });

    await showError(VALID_SLUG);

    expect(process.exitCode).toBe(1);
    expect(exitSpy).not.toHaveBeenCalled();

    process.cwd = origCwd;
  });
});
