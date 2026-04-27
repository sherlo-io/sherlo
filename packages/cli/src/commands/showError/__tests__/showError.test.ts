import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Module from 'module';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return { ...actual, execSync: vi.fn() };
});

import * as childProcess from 'child_process';
import {
  detectPlatform,
  selectProjectType,
  detectEntryFile,
  findSourceMap,
  buildSourceMaps,
  runMetroSymbolicate,
  symbolicateAllFrames,
  renderOutput,
  type ParsedFrame,
  type JsErrorJson,
} from '../showError';

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
// selectProjectType
// ---------------------------------------------------------------------------

function makeJsonData(overrides: Partial<JsErrorJson> = {}): JsErrorJson {
  return {
    name: 'Error',
    message: 'test',
    stack: [],
    componentStack: [],
    digest: null,
    cause: null,
    hasExpo: false,
    engine: 'jsc',
    ...overrides,
  };
}

describe('selectProjectType', () => {
  it('returns bare-rn when hasExpo is false', () => {
    const dir = makeTempDir();
    const data = makeJsonData({ hasExpo: false });
    expect(selectProjectType(data, dir)).toBe('bare-rn');
  });

  it('returns expo when hasExpo is true and @expo/cli is resolvable', () => {
    const dir = makeTempDir();
    const data = makeJsonData({ hasExpo: true });
    // Mock Module._resolveFilename which is the implementation of require.resolve
    const spy = vi.spyOn(Module as any, '_resolveFilename').mockReturnValueOnce('/some/path/@expo/cli');
    expect(selectProjectType(data, dir)).toBe('expo');
    spy.mockRestore();
  });

  it('returns bare-rn when hasExpo is true but @expo/cli is not resolvable', () => {
    const dir = makeTempDir();
    const data = makeJsonData({ hasExpo: true });
    // Empty tempdir has no node_modules, so require.resolve throws naturally
    expect(selectProjectType(data, dir)).toBe('bare-rn');
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
    engine: 'jsc',
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
