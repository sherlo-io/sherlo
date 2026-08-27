/**
 * `sherlo fingerprint` end to end over a fixture project: the printed layers,
 * the written document (and that it never carries a native source's contents),
 * the diff against a baseline, and the exit code that diff sets.
 *
 * `@expo/fingerprint` is mocked so no real native tree is scanned; the mock
 * returns a `contents` source WITH a value, which is exactly the thing the
 * written file must not contain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const mockCreateFingerprintAsync = vi.fn();

vi.mock('@expo/fingerprint', () => ({
  createFingerprintAsync: (...args: unknown[]) => mockCreateFingerprintAsync(...args),
  SourceSkips: { None: 0, ExpoConfigVersions: 1, ExpoConfigRuntimeVersionIfString: 2 },
}));

// Autolinking shells out; the fixture has nothing to resolve.
vi.mock('../../../helpers/runShellCommand', () => ({
  default: vi.fn().mockRejectedValue(new Error('not available in test')),
}));

const SECRET = 'sk-live-this-must-never-be-written';

const EXPO_FINGERPRINT = {
  hash: 'layer1-hash',
  sources: [
    { type: 'file', filePath: 'ios/Podfile', hash: 'f'.repeat(64), reasons: [] },
    { type: 'dir', filePath: 'android', hash: 'd'.repeat(64), reasons: [] },
    {
      type: 'contents',
      id: 'expoConfig',
      contents: JSON.stringify({ extra: { apiKey: SECRET } }),
      hash: 'c'.repeat(64),
      reasons: [],
    },
  ],
};

function writeJson(dir: string, relativePath: string, value: unknown): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(value));
}

function writeText(dir: string, relativePath: string, text: string): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text);
}

/** A bare project with an installed tree, a lockfile and one app source file. */
function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fp-cmd-'));
  writeJson(dir, 'package.json', { name: 'app', version: '1.0.0' });
  writeText(dir, 'yarn.lock', '# lockfile v1');
  writeText(dir, 'ios/Podfile', 'platform :ios');
  writeJson(dir, 'node_modules/react/package.json', { name: 'react', version: '18.2.0' });
  writeJson(dir, 'node_modules/left-pad/package.json', { name: 'left-pad', version: '1.3.0' });
  writeText(dir, 'src/App.tsx', 'export const App = 1;');
  return dir;
}

/** A bundle directory holding only the android module manifest. */
function makeBundleDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fp-bundle-'));
  writeJson(dir, 'module-manifest.android.json', {
    version: 1,
    header: {},
    moduleHashes: { 'src/App.tsx': 'm1', 'node_modules/react/index.js': 'm2' },
    storyClosures: {},
  });
  return dir;
}

describe('sherlo fingerprint', () => {
  let fingerprint: typeof import('../fingerprint').default;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let cleanupDirs: string[];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCreateFingerprintAsync.mockResolvedValue(EXPO_FINGERPRINT);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.exitCode = undefined;
    cleanupDirs = [];
    fingerprint = (await import('../fingerprint')).default;
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.exitCode = undefined;
    for (const dir of cleanupDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  function output(): string {
    return logSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
  }

  function project(): string {
    const dir = makeProject();
    cleanupDirs.push(dir);
    return dir;
  }

  it('prints one line per layer with the full digest, in a stable column layout', async () => {
    const dir = project();

    await fingerprint({ projectRoot: dir });

    const lines = output().split('\n');
    expect(lines[0]).toBe('native        layer1-hash');
    expect(lines[1]).toMatch(/^dependencies  [0-9a-f]{64}$/);
    expect(lines[2]).toMatch(
      /^js            not computed \(needs a module manifest; pass --bundle-dir/
    );
    expect(lines[3]).toMatch(/^base          [0-9a-f]{64}$/);
    expect(process.exitCode).toBeUndefined();
  });

  it('prints not computed with the reason when the base fingerprint is unavailable', async () => {
    mockCreateFingerprintAsync.mockRejectedValue(new Error('no native project'));
    const dir = project();

    await fingerprint({ projectRoot: dir });

    expect(output()).toContain('native        not computed (');
    expect(output()).toContain('base          not computed (');
  });

  it('lists every source, package, lockfile and file with --verbose', async () => {
    const dir = project();
    const bundleDir = makeBundleDir();
    cleanupDirs.push(bundleDir);

    await fingerprint({ projectRoot: dir, bundleDir, verbose: true });

    const out = output();
    expect(out).toContain(`  file     ios/Podfile  ${'f'.repeat(12)}`);
    expect(out).toContain(`  contents expoConfig  ${'c'.repeat(12)}`);
    expect(out).toContain('  source   node_modules');
    expect(out).toContain('  package  react@18.2.0');
    expect(out).toContain('  file     src/App.tsx  ');
    expect(out).toContain('  workflow bare');
    expect(out).toContain('  lockfile yarn.lock  ');
    expect(out).not.toContain(SECRET);
  });

  it('computes the js layer from a bundle directory, reading bytes from the current tree', async () => {
    const dir = project();
    const bundleDir = makeBundleDir();
    cleanupDirs.push(bundleDir);
    const documentPath = path.join(dir, 'fingerprint.json');

    await fingerprint({ projectRoot: dir, bundleDir, write: documentPath });

    expect(output()).toMatch(/^js android    [0-9a-f]{64}$/m);
    const document = JSON.parse(fs.readFileSync(documentPath, 'utf8'));
    expect(document.js.android.fileCount).toBe(1);
    expect(document.js.android.files).toEqual([
      { path: 'src/App.tsx', digest: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);
  });

  it('refuses a bundle directory with no module manifest', async () => {
    const dir = project();
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fp-empty-'));
    cleanupDirs.push(emptyDir);

    await expect(fingerprint({ projectRoot: dir, bundleDir: emptyDir })).rejects.toThrow(
      'No module manifest found'
    );
  });

  describe('--write', () => {
    it('writes the digests and the pre-image with the documented shape', async () => {
      const dir = project();
      const documentPath = path.join(dir, 'fingerprint.json');

      await fingerprint({ projectRoot: dir, write: documentPath });

      const document = JSON.parse(fs.readFileSync(documentPath, 'utf8'));
      expect(document.formatVersion).toBe(1);
      expect(typeof document.cliVersion).toBe('string');
      expect(document.native).toEqual({
        hash: 'layer1-hash',
        sources: [
          { type: 'file', id: 'ios/Podfile', hash: 'f'.repeat(64) },
          { type: 'dir', id: 'android', hash: 'd'.repeat(64) },
          { type: 'contents', id: 'expoConfig', hash: 'c'.repeat(64) },
        ],
      });
      expect(document.dependencies).toEqual({
        hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        source: 'node_modules',
        installedPackages: [
          { name: 'left-pad', versions: ['1.3.0'] },
          { name: 'react', versions: ['18.2.0'] },
        ],
      });
      expect(document.js).toEqual({});
      expect(document.base).toEqual({
        hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        workflow: 'bare',
        lockfiles: [{ file: 'yarn.lock', digest: expect.stringMatching(/^[0-9a-f]{64}$/) }],
        autolinkedModules: [],
      });
      expect(output()).toContain(`Written to ${documentPath}`);
    });

    it('never writes a contents source value, even when the source has one', async () => {
      const dir = project();
      const documentPath = path.join(dir, 'fingerprint.json');

      await fingerprint({ projectRoot: dir, write: documentPath });

      const raw = fs.readFileSync(documentPath, 'utf8');
      expect(raw).not.toContain(SECRET);
      expect(raw).not.toContain('"contents":');
      expect(raw).not.toContain('apiKey');
    });

    it('writes byte-identical files for the same tree', async () => {
      const dir = project();
      const first = path.join(dir, 'first.json');
      const second = path.join(dir, 'second.json');

      await fingerprint({ projectRoot: dir, write: first });
      await fingerprint({ projectRoot: dir, write: second });

      expect(fs.readFileSync(first, 'utf8')).toBe(fs.readFileSync(second, 'utf8'));
    });
  });

  describe('--baseline', () => {
    it('exits 0 and reports every layer unchanged when nothing moved', async () => {
      const dir = project();
      const baseline = path.join(dir, 'baseline.json');
      await fingerprint({ projectRoot: dir, write: baseline });
      logSpy.mockClear();

      await fingerprint({ projectRoot: dir, baseline });

      expect(output()).toContain(`Against ${baseline}:`);
      expect(output()).toContain('native        unchanged');
      expect(output()).toContain('dependencies  unchanged');
      expect(output()).toContain('base          unchanged');
      expect(output()).toContain('0 layer(s) changed');
      expect(process.exitCode).toBeUndefined();
    });

    it('exits 1 and names the moved package when a dependency changed', async () => {
      const dir = project();
      const baseline = path.join(dir, 'baseline.json');
      await fingerprint({ projectRoot: dir, write: baseline });
      logSpy.mockClear();

      writeJson(dir, 'node_modules/react/package.json', { name: 'react', version: '18.3.1' });
      fs.rmSync(path.join(dir, 'node_modules/left-pad'), { recursive: true });
      writeJson(dir, 'node_modules/dayjs/package.json', { name: 'dayjs', version: '1.11.0' });

      await fingerprint({ projectRoot: dir, baseline });

      const out = output();
      expect(out).toContain('dependencies  changed');
      expect(out).toContain('  + dayjs 1.11.0');
      expect(out).toContain('  - left-pad 1.3.0');
      expect(out).toContain('  ~ react 18.2.0 -> 18.3.1');
      expect(out).toContain('1 layer(s) changed');
      expect(process.exitCode).toBe(1);
    });

    it('names the changed lockfile under base and the changed native source under native', async () => {
      const dir = project();
      const baseline = path.join(dir, 'baseline.json');
      await fingerprint({ projectRoot: dir, write: baseline });
      logSpy.mockClear();

      writeText(dir, 'yarn.lock', '# lockfile v2');
      mockCreateFingerprintAsync.mockResolvedValue({
        ...EXPO_FINGERPRINT,
        hash: 'layer1-hash-2',
        sources: EXPO_FINGERPRINT.sources.map((source) =>
          source.type === 'contents' ? { ...source, hash: 'e'.repeat(64) } : source
        ),
      });

      await fingerprint({ projectRoot: dir, baseline });

      const out = output();
      expect(out).toContain('native        changed');
      expect(out).toContain('  ~ expoConfig');
      expect(out).toContain('base          changed');
      expect(out).toMatch(/ {2}~ yarn\.lock [0-9a-f]{12} -> [0-9a-f]{12}/);
      expect(out).toContain('2 layer(s) changed');
      expect(out).not.toContain(SECRET);
      expect(process.exitCode).toBe(1);
    });

    it('names the edited app source file when a bundle directory is supplied', async () => {
      const dir = project();
      const bundleDir = makeBundleDir();
      cleanupDirs.push(bundleDir);
      const baseline = path.join(dir, 'baseline.json');
      await fingerprint({ projectRoot: dir, bundleDir, write: baseline });
      logSpy.mockClear();

      writeText(dir, 'src/App.tsx', 'export const App = 2;');

      await fingerprint({ projectRoot: dir, bundleDir, baseline });

      const out = output();
      expect(out).toContain('js android    changed');
      expect(out).toMatch(/ {2}~ src\/App\.tsx [0-9a-f]{12} -> [0-9a-f]{12}/);
      expect(process.exitCode).toBe(1);
    });

    it('fails with a clear message on a baseline of a different format version', async () => {
      const dir = project();
      const baseline = path.join(dir, 'baseline.json');
      writeJson(dir, 'baseline.json', { formatVersion: 2 });

      await expect(fingerprint({ projectRoot: dir, baseline })).rejects.toThrow(
        'has format version 2, but this CLI reads format version 1'
      );
    });
  });
});
