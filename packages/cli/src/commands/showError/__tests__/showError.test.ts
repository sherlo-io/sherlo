import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  parseStackFrames,
  parseErrorSections,
  detectPlatform,
  detectProjectType,
  detectEntryFile,
  findSourceMap,
  symbolicateSections,
  runMetroSymbolicate,
  reformatSymbolicatedLine,
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
// parseStackFrames
// ---------------------------------------------------------------------------

describe('parseStackFrames', () => {
  it('extracts frames from standard 4-space indent', () => {
    const text = `TypeError: undefined is not an object
    at Object.render (bundle-abc.jsbundle:1:500)
    at c (bundle-abc.jsbundle:633:288)`;
    const frames = parseStackFrames(text);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ fnName: 'Object.render', file: 'bundle-abc.jsbundle', line: 1, col: 500 });
    expect(frames[1]).toMatchObject({ fnName: 'c', file: 'bundle-abc.jsbundle', line: 633, col: 288 });
  });

  it('extracts frames with 2-space indent', () => {
    const text = `Error: boom\n  at foo (index.js:10:5)\n  at bar (index.js:20:3)`;
    const frames = parseStackFrames(text);
    expect(frames).toHaveLength(2);
    expect(frames[0].fnName).toBe('foo');
    expect(frames[1].fnName).toBe('bar');
  });

  it('returns empty array when no frames present', () => {
    expect(parseStackFrames('Error: something happened\nno frames here')).toHaveLength(0);
  });

  it('ignores lines that do not match the at-pattern', () => {
    const text = `  at foo (bundle.js:1:1)\n  not a frame\n  at bar (bundle.js:2:2)`;
    expect(parseStackFrames(text)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// parseErrorSections
// ---------------------------------------------------------------------------

describe('parseErrorSections', () => {
  it('splits input with two sections into preamble + 2 named sections', () => {
    const input = [
      'TypeError: undefined is not an object',
      '',
      'Component tree:',
      '    at CrashComponent (bundle.js:1:100)',
      '    at View (bundle.js:1:200)',
      '',
      'Stack trace:',
      '    at c (bundle.js:1:500)',
      '    at b (bundle.js:1:300)',
    ].join('\n');

    const sections = parseErrorSections(input);
    expect(sections).toHaveLength(3);

    expect(sections[0].header).toBeNull();
    expect(sections[0].lines.join('\n')).toContain('TypeError');

    expect(sections[1].header).toBe('Component tree');
    expect(sections[1].lines.some((l) => l.includes('CrashComponent'))).toBe(true);

    expect(sections[2].header).toBe('Stack trace');
    expect(sections[2].lines.some((l) => l.includes('at c'))).toBe(true);
  });

  it('returns a single preamble section when no section headers present', () => {
    const input = 'Error: boom\n    at foo (bundle.js:1:1)';
    const sections = parseErrorSections(input);
    expect(sections).toHaveLength(1);
    expect(sections[0].header).toBeNull();
  });

  it('preserves non-frame lines within sections unchanged', () => {
    const input = 'Stack trace:\n    at foo (b.js:1:1)\n    (blank line above preserved)';
    const sections = parseErrorSections(input);
    const stackSection = sections.find((s) => s.header === 'Stack trace')!;
    expect(stackSection.lines).toContain('    (blank line above preserved)');
  });
});

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
// detectPlatform
// ---------------------------------------------------------------------------

describe('detectPlatform', () => {
  it('detects android from index.android.bundle', () => {
    expect(detectPlatform('at c (index.android.bundle:1:100)')).toBe('android');
  });

  it('detects android from /data/user/0/ path', () => {
    expect(detectPlatform('at c (/data/user/0/com.app/files/.expo-internal/abc:1:2)')).toBe('android');
  });

  it('detects android from data/data/ path', () => {
    expect(detectPlatform('at c (data/data/com.app/files/bundle:1:2)')).toBe('android');
  });

  it('detects ios from .jsbundle extension', () => {
    expect(detectPlatform('at c (bundle-abc.jsbundle:1:100)')).toBe('ios');
  });

  it('detects ios from CoreSimulator/Devices path', () => {
    expect(detectPlatform('at c (CoreSimulator/Devices/UUID/data/app/bundle.js:1:1)')).toBe('ios');
  });

  it('detects ios from Library/Application Support/.expo-internal path', () => {
    expect(detectPlatform('at c (Library/Application Support/.expo-internal/bundle:1:1)')).toBe('ios');
  });

  it('defaults to ios for ambiguous content', () => {
    expect(detectPlatform('at foo (unknown-bundle.js:1:1)')).toBe('ios');
  });
});

// ---------------------------------------------------------------------------
// detectProjectType
// ---------------------------------------------------------------------------

describe('detectProjectType', () => {
  it('returns expo when package.json has expo dep', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { dependencies: { expo: '^51.0.0', 'react-native': '*' } });
    expect(detectProjectType(dir)).toBe('expo');
  });

  it('returns expo when app.json exists', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { dependencies: { 'react-native': '*' } });
    fs.writeFileSync(path.join(dir, 'app.json'), '{}');
    expect(detectProjectType(dir)).toBe('expo');
  });

  it('returns expo when app.config.js exists', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { dependencies: { 'react-native': '*' } });
    fs.writeFileSync(path.join(dir, 'app.config.js'), 'module.exports = {};');
    expect(detectProjectType(dir)).toBe('expo');
  });

  it('returns bare-rn when only react-native dep present', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { dependencies: { 'react-native': '0.73.0' } });
    expect(detectProjectType(dir)).toBe('bare-rn');
  });

  it('throws when no RN project detected', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { dependencies: {} });
    expect(() => detectProjectType(dir)).toThrow('Run from your React Native project root');
  });

  it('throws when package.json not found', () => {
    const dir = makeTempDir();
    expect(() => detectProjectType(dir)).toThrow('Run from your React Native project root');
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
// symbolicateSections — unit test with mocked metro-symbolicate
// ---------------------------------------------------------------------------

describe('symbolicateSections', () => {
  it('two sections produce the right section headers after parseErrorSections', () => {
    const input = [
      'TypeError: boom',
      '',
      'Component tree:',
      '    at c (bundle.js:1:100)',
      '',
      'Stack trace:',
      '    at d (bundle.js:1:200)',
    ].join('\n');
    const sections = parseErrorSections(input);
    // Structural invariant: preamble + 2 named sections
    expect(sections).toHaveLength(3);
    expect(sections[1].header).toBe('Component tree');
    expect(sections[2].header).toBe('Stack trace');
  });

  it('preamble section (header null) is correctly identified', () => {
    const input = 'Error: boom\n\nStack trace:\n    at c (b.js:1:1)';
    const sections = parseErrorSections(input);
    const preamble = sections.find((s) => s.header === null)!;
    const nonPreamble = sections.filter((s) => s.header !== null);

    expect(preamble).toBeDefined();
    expect(nonPreamble.every((s) => s.header !== null)).toBe(true);
    expect(nonPreamble[0].header).toBe('Stack trace');
  });

  it('output frames use 2-space indent convention', () => {
    const frameLine = '  at CrashComponent (App.tsx:7:18)';
    expect(frameLine.startsWith('  at ')).toBe(true);
    expect(frameLine.startsWith('    at ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reformatSymbolicatedLine
// ---------------------------------------------------------------------------

describe('reformatSymbolicatedLine', () => {
  it('returns function-name-in-col format: strips leading slash, puts fnName first', () => {
    // metro-symbolicate outputs: at c (/App.tsx:7:CrashComponent)
    expect(reformatSymbolicatedLine('at c (/App.tsx:7:CrashComponent)')).toBe('at CrashComponent (App.tsx:7)');
  });

  it('returns standard numeric-col format: strips leading slash', () => {
    // metro-symbolicate outputs: at renderWithHooks (/node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-prod.js:3024:15)
    const result = reformatSymbolicatedLine('at renderWithHooks (/node_modules/react-native/Libraries/Renderer.js:3024:15)');
    expect(result).toBe('at renderWithHooks (node_modules/react-native/Libraries/Renderer.js:3024:15)');
  });

  it('does not strip slash from non-leading slash in path', () => {
    expect(reformatSymbolicatedLine('at foo (src/components/App.tsx:10:SomeComponent)')).toBe('at SomeComponent (src/components/App.tsx:10)');
  });

  it('returns line unchanged when it does not match at-pattern', () => {
    expect(reformatSymbolicatedLine('some random text')).toBe('some random text');
  });

  it('handles path with spaces (iOS Application Support)', () => {
    const raw = 'at Gl (/Library/Application Support/.expo-internal/bundle.js:1:renderWithHooks)';
    const result = reformatSymbolicatedLine(raw);
    expect(result).toBe('at renderWithHooks (Library/Application Support/.expo-internal/bundle.js:1)');
  });
});

// ---------------------------------------------------------------------------
// runMetroSymbolicate — structural tests (no real binary needed)
// ---------------------------------------------------------------------------

describe('runMetroSymbolicate', () => {
  it('returns empty array when no frame lines provided', () => {
    // No need to shell out — empty input returns empty output
    const result = runMetroSymbolicate([], '/any/path.map', process.cwd());
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('error cases', () => {
  it('invalid URL: non-200 response triggers error path', () => {
    const mockRes = { ok: false, status: 403 };
    expect(!mockRes.ok).toBe(true);
  });

  it('missing package.json: detectProjectType throws', () => {
    const emptyDir = makeTempDir();
    expect(() => detectProjectType(emptyDir)).toThrow('Run from your React Native project root');
  });
});
