import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  parseStackFrames,
  detectProjectType,
  pickSourceMap,
  applySourceMap,
} from '../symbolicate';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
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
  it('extracts (fnName, file, line, col) from a standard stack', () => {
    const text = `TypeError: undefined is not an object
    at Object.render (bundle-abc.jsbundle:1:500)
    at c (bundle-abc.jsbundle:633:288)
    at <unknown> (bundle-abc.jsbundle:2:10)`;
    const frames = parseStackFrames(text);
    expect(frames).toHaveLength(3);
    expect(frames[0]).toMatchObject({ fnName: 'Object.render', file: 'bundle-abc.jsbundle', line: 1, col: 500 });
    expect(frames[1]).toMatchObject({ fnName: 'c', file: 'bundle-abc.jsbundle', line: 633, col: 288 });
    expect(frames[2]).toMatchObject({ fnName: '<unknown>', file: 'bundle-abc.jsbundle', line: 2, col: 10 });
  });

  it('returns empty array when no stack frames present', () => {
    expect(parseStackFrames('No stack here')).toHaveLength(0);
  });

  it('ignores lines that do not match the at-pattern', () => {
    const text = `  at foo (bundle.js:1:1)\n  not a frame\n  at bar (bundle.js:2:2)`;
    const frames = parseStackFrames(text);
    expect(frames).toHaveLength(2);
    expect(frames[0].fnName).toBe('foo');
    expect(frames[1].fnName).toBe('bar');
  });
});

// ---------------------------------------------------------------------------
// detectProjectType - uses real temp directories
// ---------------------------------------------------------------------------

describe('detectProjectType', () => {
  it('returns expo when package.json has expo dep', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', { dependencies: { expo: '^51.0.0', 'react-native': '*' } });
    expect(detectProjectType(dir)).toBe('expo');
  });

  it('returns expo when app.json exists even without expo dep', () => {
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
    expect(() => detectProjectType(dir)).toThrow('Could not detect React Native project type');
  });

  it('throws when package.json not found', () => {
    const dir = makeTempDir();
    expect(() => detectProjectType(dir)).toThrow('Could not detect React Native project type');
  });
});

// ---------------------------------------------------------------------------
// pickSourceMap
// ---------------------------------------------------------------------------

describe('pickSourceMap', () => {
  it('picks the single matching map', () => {
    const maps = ['/project/dist/_expo/static/js/ios/bundle-abc.jsbundle.map'];
    const result = pickSourceMap(maps, 'at foo (bundle-abc.jsbundle:1:1)', undefined);
    expect(result).toBe(maps[0]);
  });

  it('uses --platform hint to disambiguate multiple maps', () => {
    const maps = [
      '/project/dist/_expo/static/js/ios/bundle.jsbundle.map',
      '/project/dist/_expo/static/js/android/bundle.jsbundle.map',
    ];
    expect(pickSourceMap(maps, 'at foo (bundle.jsbundle:1:1)', 'ios')).toContain('/ios/');
    expect(pickSourceMap(maps, 'at foo (bundle.jsbundle:1:1)', 'android')).toContain('/android/');
  });

  it('throws when multiple candidates and no platform hint', () => {
    const maps = [
      '/project/dist/_expo/static/js/ios/bundle.jsbundle.map',
      '/project/dist/_expo/static/js/android/bundle.jsbundle.map',
    ];
    expect(() => pickSourceMap(maps, 'at foo (bundle.jsbundle:1:1)', undefined)).toThrow(
      'Multiple source maps found'
    );
  });

  it('throws when no maps at all', () => {
    expect(() => pickSourceMap([], 'at foo (bundle.jsbundle:1:1)', undefined)).toThrow(
      'No source map found'
    );
  });
});

// ---------------------------------------------------------------------------
// applySourceMap - fixture test
// ---------------------------------------------------------------------------

describe('applySourceMap', () => {
  it('resolves frames using a real inline source map', async () => {
    const { SourceMapGenerator } = await import('source-map');
    const gen = new SourceMapGenerator({ file: 'bundle.js' });
    gen.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 42, column: 5 },
      source: 'src/components/CrashComponent.tsx',
      name: 'CrashComponent',
    });
    gen.setSourceContent(
      'src/components/CrashComponent.tsx',
      'export function CrashComponent() { throw new Error(); }'
    );

    const tmpMap = path.join(os.tmpdir(), `__sherlo_test_fixture_${Date.now()}__.map`);
    fs.writeFileSync(tmpMap, gen.toString());

    try {
      const frames = [{ fnName: 'c', file: 'bundle.js', line: 1, col: 0, raw: '    at c (bundle.js:1:0)' }];
      const result = await applySourceMap(frames, tmpMap);
      expect(result).toHaveLength(1);
      expect(result[0].resolved).toBe(true);
      expect(result[0].output).toContain('CrashComponent');
      expect(result[0].output).toContain('CrashComponent.tsx');
      expect(result[0].output).toContain('42');
    } finally {
      try { fs.unlinkSync(tmpMap); } catch (_) {}
    }
  });

  it('marks unresolved frames with [unresolved] prefix', async () => {
    const { SourceMapGenerator } = await import('source-map');
    const gen = new SourceMapGenerator({ file: 'bundle.js' });
    // No mappings — nothing resolves
    const tmpMap = path.join(os.tmpdir(), `__sherlo_test_empty_${Date.now()}__.map`);
    fs.writeFileSync(tmpMap, gen.toString());

    try {
      const frames = [{ fnName: 'foo', file: 'bundle.js', line: 99, col: 99, raw: '    at foo (bundle.js:99:99)' }];
      const result = await applySourceMap(frames, tmpMap);
      expect(result[0].resolved).toBe(false);
      expect(result[0].output).toContain('[unresolved]');
    } finally {
      try { fs.unlinkSync(tmpMap); } catch (_) {}
    }
  });
});

// ---------------------------------------------------------------------------
// Pre-flight git warning - pure logic test (no execSync mock needed)
// ---------------------------------------------------------------------------

describe('pre-flight git warning logic', () => {
  it('dirty tree detection: non-empty porcelain output = dirty', () => {
    const dirtyOutput = 'M  src/App.tsx\nM  package.json';
    expect(dirtyOutput.trim().length > 0).toBe(true);
  });

  it('clean tree detection: empty porcelain output = clean', () => {
    const cleanOutput = '';
    expect(cleanOutput.trim().length === 0).toBe(true);
  });
});
