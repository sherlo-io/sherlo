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
import http from 'http';
import https from 'https';
import os from 'os';
import path from 'path';
import runShellCommand from '../../../helpers/runShellCommand';

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

/** A yarn classic lockfile resolving exactly the given packages. */
function yarnLock(packages: Record<string, string>): string {
  const blocks = Object.entries(packages).map(
    ([name, version]) => `${name}@^${version}:\n  version "${version}"\n`
  );
  return `# yarn lockfile v1\n\n\n${blocks.join('\n')}`;
}

/** A bare project with a lockfile and one app source file. */
function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fp-cmd-'));
  writeJson(dir, 'package.json', { name: 'app', version: '1.0.0' });
  writeText(dir, 'yarn.lock', yarnLock({ react: '18.2.0', 'left-pad': '1.3.0' }));
  writeText(dir, 'ios/Podfile', 'platform :ios');
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
    expect(lines[1]).toMatch(/^dependencies {2}[0-9a-f]{64}$/);
    expect(lines[2]).toMatch(/^js {12}not computed \(needs a module manifest; pass --bundle-dir/);
    expect(lines[3]).toMatch(/^base {10}[0-9a-f]{64}$/);
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
    expect(out).toContain('  source   yarn.lock');
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

    expect(output()).toMatch(/^js android {4}[0-9a-f]{64}$/m);
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
      expect(document.formatVersion).toBe(2);
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
        source: 'yarn.lock',
        packages: [
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

    it('exits 1 and names the moved package, from the lockfile, when a dependency changed', async () => {
      const dir = project();
      const baseline = path.join(dir, 'baseline.json');
      await fingerprint({ projectRoot: dir, write: baseline });
      logSpy.mockClear();

      // The lockfile moved: one bump, one removal, one addition.
      writeText(dir, 'yarn.lock', yarnLock({ react: '18.3.1', dayjs: '1.11.0' }));

      await fingerprint({ projectRoot: dir, baseline });

      const out = output();
      expect(out).toContain('dependencies  changed');
      expect(out).toContain('  + dayjs 1.11.0');
      expect(out).toContain('  - left-pad 1.3.0');
      expect(out).toContain('  ~ react 18.2.0 -> 18.3.1');
      // The lockfile's bytes are a base input too, so the base layer moves with it.
      expect(out).toContain('base          changed');
      expect(out).toMatch(/ {2}~ yarn\.lock [0-9a-f]{12} -> [0-9a-f]{12}/);
      expect(out).toContain('2 layer(s) changed');
      expect(process.exitCode).toBe(1);
    });

    it('names the changed lockfile under base and the changed native source under native', async () => {
      const dir = project();
      const baseline = path.join(dir, 'baseline.json');
      await fingerprint({ projectRoot: dir, write: baseline });
      logSpy.mockClear();

      // A lockfile edit that resolves nothing new moves only the base layer.
      writeText(
        dir,
        'yarn.lock',
        `${yarnLock({ react: '18.2.0', 'left-pad': '1.3.0' })}# edited\n`
      );
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

    it('names the changed INPUT of a generated file, never the generated file itself', async () => {
      const dir = project();
      writeText(dir, '.rnstorybook/main.ts', 'export default { stories: ["a"] };');
      // The generated file is absent, as on any tree that did not just bundle.
      const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fp-generated-'));
      cleanupDirs.push(bundleDir);
      writeJson(bundleDir, 'module-manifest.android.json', {
        version: 1,
        header: {
          generatedFiles: {
            './.rnstorybook/storybook.requires.ts': {
              generatedBy: 'storybook-requires',
              inputs: ['./.rnstorybook/main.ts'],
            },
          },
        },
        moduleHashes: { 'src/App.tsx': 'm1', './.rnstorybook/storybook.requires.ts': 'm3' },
        storyClosures: {},
      });
      const baseline = path.join(dir, 'baseline.json');
      await fingerprint({ projectRoot: dir, bundleDir, write: baseline });
      logSpy.mockClear();

      writeText(dir, '.rnstorybook/main.ts', 'export default { stories: ["a", "b"] };');

      await fingerprint({ projectRoot: dir, bundleDir, baseline });

      const out = output();
      expect(out).toContain('js android    changed');
      expect(out).toMatch(/ {2}~ \.\/\.rnstorybook\/main\.ts [0-9a-f]{12} -> [0-9a-f]{12}/);
      expect(out).not.toContain('storybook.requires');
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
      writeJson(dir, 'baseline.json', { formatVersion: 1 });

      await expect(fingerprint({ projectRoot: dir, baseline })).rejects.toThrow(
        'has format version 1, but this CLI reads format version 2'
      );
    });
  });

  // One layer, one digest: the shape a build cache reads - `FP=$(sherlo
  // fingerprint --layer base)`, four lines of shell, no JSON parser.
  describe('--layer', () => {
    it('asks for one layer and is given one digest', async () => {
      const dir = project();
      const bundleDir = makeBundleDir();
      cleanupDirs.push(bundleDir);

      // The report first, so every layer's digest is known and the single-layer
      // answers can be checked to BE those numbers rather than merely to look
      // like digests.
      await fingerprint({ projectRoot: dir, bundleDir });
      // Each report line is `<layer name><column padding><digest>`, so two or
      // more spaces separate the two - `js android` keeps its single one.
      const reported = Object.fromEntries(
        output()
          .split('\n')
          .map((line) => line.split(/ {2,}/))
      );

      // The `--layer` argument, and the line of the report it must agree with.
      for (const [layer, reportedLayer] of [
        ['native', 'native'],
        ['dependencies', 'dependencies'],
        ['base', 'base'],
        ['js:android', 'js android'],
      ]) {
        logSpy.mockClear();

        await fingerprint({ projectRoot: dir, bundleDir, layer });

        // ONE call, ONE argument, the digest and nothing around it: no label, no
        // `key=value`, no blank line. `console.log` adds the single newline a
        // shell's `$(...)` strips.
        expect(logSpy.mock.calls).toEqual([[reported[reportedLayer]]]);
        expect(process.exitCode).toBeUndefined();
      }
    });

    it('a layer that cannot be computed is refused with its reason', async () => {
      const dir = project();
      const androidOnlyBundleDir = makeBundleDir();
      cleanupDirs.push(androidOnlyBundleDir);

      // The js layer of a platform this bundle directory was never emitted for:
      // its own message, naming ios - not the report's "no manifest at all".
      await expect(
        fingerprint({ projectRoot: dir, bundleDir: androidOnlyBundleDir, layer: 'js:ios' })
      ).rejects.toThrow(/js ios layer could not be computed.*holds no ios module manifest/s);

      // The same layer with no bundle directory supplied at all.
      await expect(fingerprint({ projectRoot: dir, layer: 'js:android' })).rejects.toThrow(
        /js android layer could not be computed.*--bundle-dir/s
      );

      // A layer name the command does not have.
      await expect(fingerprint({ projectRoot: dir, layer: 'js' })).rejects.toThrow(
        /Unknown layer "js".*js:android, js:ios/s
      );

      // The fail-soft base fingerprint: `computeBaseFingerprint` degrades to a
      // null hash with a reason so a push still works, and this path turns that
      // null into a refusal carrying the same reason.
      mockCreateFingerprintAsync.mockRejectedValue(new Error('no native project'));

      await expect(fingerprint({ projectRoot: dir, layer: 'base' })).rejects.toThrow(
        /base layer could not be computed: .+/
      );
      await expect(fingerprint({ projectRoot: dir, layer: 'native' })).rejects.toThrow(
        /native layer could not be computed: .+/
      );

      // Not one of the refusals above reached stdout: a caller that reads an
      // empty line as "nothing changed" would skip a build it needed.
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('reaches no server, starts no build and asks for no token', async () => {
      const dir = project();
      const bundleDir = makeBundleDir();
      cleanupDirs.push(bundleDir);
      // Every request this CLI makes leaves through node's http/https - the one
      // door `node-fetch` and the reporting client both go out of.
      const requestSpies = [vi.spyOn(http, 'request'), vi.spyOn(https, 'request')];
      // The command takes no token option; these are the two env vars a token
      // would arrive in, and it must answer without either.
      const tokenVariables = ['SHERLO_TOKEN', 'SHERLO_PERSONAL_TOKEN'];
      const savedTokens = tokenVariables.map((name) => [name, process.env[name]] as const);
      for (const name of tokenVariables) delete process.env[name];
      logSpy.mockClear();

      try {
        await fingerprint({ projectRoot: dir, bundleDir, layer: 'base' });
        await fingerprint({ projectRoot: dir, bundleDir, layer: 'js:android' });
        await fingerprint({ projectRoot: dir, bundleDir });

        // Three answers, with no token anywhere to be found.
        expect(logSpy).toHaveBeenCalledTimes(3);
        for (const spy of requestSpies) expect(spy).not.toHaveBeenCalled();

        // The only subprocesses are the read-only autolinking probes the base
        // fingerprint resolves its module set with. Nothing bundles, nothing
        // builds, nothing uploads.
        for (const [options] of vi.mocked(runShellCommand).mock.calls) {
          expect(options.command).toMatch(
            /^npx (react-native config|expo-modules-autolinking resolve|expo config)/
          );
        }
      } finally {
        for (const spy of requestSpies) spy.mockRestore();
        for (const [name, value] of savedTokens) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    });

    it('refuses the options that write to the same stdout', async () => {
      const dir = project();

      for (const conflicting of [
        { write: path.join(dir, 'written.json') },
        { baseline: path.join(dir, 'baseline.json') },
        { verbose: true },
      ]) {
        await expect(
          fingerprint({ projectRoot: dir, layer: 'base', ...conflicting })
        ).rejects.toThrow(/`--layer` prints one digest and nothing else/);
      }

      expect(fs.existsSync(path.join(dir, 'written.json'))).toBe(false);
    });
  });
});
