/**
 * Tests for readValidatedModuleManifest - the fail-soft module-manifest reader
 * (SHERLO-1894 Phase B). BAIL-OPEN is the headline contract: every failure mode
 * (missing, unreadable, non-JSON, wrong shape) returns null and NEVER throws, so a
 * manifest problem can never block a build. The happy path returns the raw bytes
 * verbatim plus the parsed manifest.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteModuleManifestSidecar, readValidatedModuleManifest } from '../readModuleManifest';

const MANIFEST_REL = ['node_modules', '.cache', 'sherlo', 'module-manifest.json'];

function validManifest() {
  return {
    version: 1,
    header: { metroVersion: '0.81.0', envDigest: 'abc', envKeys: [], absolutePathLeaks: [] },
    moduleHashes: { './src/Button.tsx': 'a'.repeat(64) },
    storyClosures: { './src/Button.stories.tsx': ['./src/Button.tsx'] },
  };
}

let projectRoot: string;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-read-manifest-'));
});

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeManifest(content: string) {
  const dir = path.join(projectRoot, ...MANIFEST_REL.slice(0, -1));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(projectRoot, ...MANIFEST_REL), content, 'utf8');
}

describe('readValidatedModuleManifest - happy path', () => {
  it('returns the raw bytes verbatim + the parsed manifest for a valid sidecar', () => {
    const raw = JSON.stringify(validManifest());
    writeManifest(raw);

    const result = readValidatedModuleManifest(projectRoot);

    expect(result).not.toBeNull();
    // Bytes are returned exactly as written (canonical serializer output preserved).
    expect(result!.raw.toString('utf8')).toBe(raw);
    expect(result!.parsed.version).toBe(1);
    expect(result!.parsed.moduleHashes['./src/Button.tsx']).toBe('a'.repeat(64));
    expect(result!.parsed.storyClosures['./src/Button.stories.tsx']).toEqual(['./src/Button.tsx']);
  });
});

describe('readValidatedModuleManifest - BAIL-OPEN failure modes (returns null, never throws)', () => {
  it('missing sidecar -> null, silently (absent is the common expected case)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // No file written at all.
    expect(readValidatedModuleManifest(projectRoot)).toBeNull();
    // Absent is expected: no warning is emitted for it.
    expect(logSpy.mock.calls.length).toBe(0);
  });

  it('unreadable sidecar (path is a directory -> readFileSync throws EISDIR) -> null + WARNING', () => {
    // A real read failure with no mocking: the sidecar path exists but is a
    // directory, so existsSync passes and readFileSync throws.
    const dir = path.join(projectRoot, ...MANIFEST_REL.slice(0, -1));
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(projectRoot, ...MANIFEST_REL));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(readValidatedModuleManifest(projectRoot)).toBeNull();
    const warned = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warned).toMatch(/WARNING/);
    expect(warned).toMatch(/continuing without it/);
  });

  it('invalid JSON -> null + WARNING', () => {
    writeManifest('{ this is : not json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(readValidatedModuleManifest(projectRoot)).toBeNull();
    const warned = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warned).toMatch(/not valid JSON/);
  });

  it.each([
    ['missing version', { header: {}, moduleHashes: {}, storyClosures: {} }],
    ['version wrong type', { version: '1', header: {}, moduleHashes: {}, storyClosures: {} }],
    ['missing header', { version: 1, moduleHashes: {}, storyClosures: {} }],
    ['header is array', { version: 1, header: [], moduleHashes: {}, storyClosures: {} }],
    ['missing moduleHashes', { version: 1, header: {}, storyClosures: {} }],
    ['missing storyClosures', { version: 1, header: {}, moduleHashes: {} }],
    ['moduleHashes is null', { version: 1, header: {}, moduleHashes: null, storyClosures: {} }],
    ['top-level is array', []],
    ['top-level is string', 'nope'],
  ])('shape-invalid (%s) -> null + WARNING', (_label, shape) => {
    writeManifest(JSON.stringify(shape));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(readValidatedModuleManifest(projectRoot)).toBeNull();
    const warned = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warned).toMatch(/unexpected shape/);
  });
});

describe('deleteModuleManifestSidecar - makes absence mean absence (SHERLO-1894 §2)', () => {
  it('removes an existing sidecar so a later read finds nothing', () => {
    writeManifest(JSON.stringify(validManifest()));
    expect(readValidatedModuleManifest(projectRoot)).not.toBeNull();

    deleteModuleManifestSidecar(projectRoot);

    // Gone from disk, and the read now bails open to null.
    expect(fs.existsSync(path.join(projectRoot, ...MANIFEST_REL))).toBe(false);
    expect(readValidatedModuleManifest(projectRoot)).toBeNull();
  });

  it('is a no-op (never throws) when no sidecar exists', () => {
    // No file written at all.
    expect(() => deleteModuleManifestSidecar(projectRoot)).not.toThrow();
    expect(readValidatedModuleManifest(projectRoot)).toBeNull();
  });
});
