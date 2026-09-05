/**
 * Tests for the bring-your-own-bundle road: `--emit-bundle-dir` produces a bundle
 * directory and `--bundle-dir` accepts it.
 *
 * The centrepiece is the ROUND TRIP. Producer and acceptor are supposed to be the
 * same code over the same schema, and the only way to keep them honest is to run
 * one into the other and prove the bytes survive. Everything else here is a
 * refusal: for each way a supplied bundle can be wrong, that it is refused, and
 * that the message NAMES the thing that is wrong - a refusal nobody can act on is
 * barely better than no refusal at all.
 *
 * The other half is the ACCEPTING MACHINE: the one that never ran an install.
 * Several tests emit on a tree that has node_modules and a generated file, strip
 * the tree down to a bare checkout, and accept - that is the whole point of
 * supplying a bundle.
 *
 * The bundler itself is never run. `emitBundleDir` takes its producer as a
 * parameter, so these tests hand it a scripted BundleResult and exercise the
 * writing, the sidecar, and every acceptance path against a real filesystem.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from '@sherlo/api-types';

vi.mock('../../showError/detectBundler', () => ({
  default: vi.fn(() => 'rn'),
  detectEntryFile: vi.fn(() => 'index.js'),
}));

vi.mock('../../init/requirements/getPackageVersion', () => ({
  default: vi.fn(),
}));

vi.mock('../readBundledSdkProtocolVersion', () => ({
  readBundledSdkProtocolVersion: vi.fn(),
}));

import getPackageVersionDefault from '../../init/requirements/getPackageVersion';
import { readBundledSdkProtocolVersion } from '../readBundledSdkProtocolVersion';
import { emitBundleDir } from '../emitBundleDir';
import { resolveSuppliedBundle } from '../suppliedBundle';
import { sidecarFileName, moduleManifestFileName, bundleFileName } from '../bundleSidecar';
import type { BundleResult } from '../buildBundle';
import type { BaseFingerprintResult, GateMetadataInput } from '../../../helpers/fingerprint';

const mockGetPackageVersion = vi.mocked(getPackageVersionDefault);
const mockReadBundledSdkProtocolVersion = vi.mocked(readBundledSdkProtocolVersion);

/**
 * These tests run the REAL project-identity reader, which touches the project
 * config the way a live run does - and a round trip runs it twice, once to write
 * the sidecar and once to check it. That is comfortably slower than vitest's 5s
 * default on a cold CI runner.
 *
 * The reader is deliberately not mocked: it is the thing under test. Both sides
 * of the comparison go through it, so faking it would leave the one property
 * these tests exist to prove - that emit and accept agree about what the project
 * is - asserted against a stub instead of the code that ships.
 */
vi.setConfig({ testTimeout: 60_000 });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let projectRoot: string;
let bundleDir: string;
/** Where the "bundler" leaves its output, standing in for .sherlo/bundled. */
let bundlerOut: string;

/**
 * The manifest names the app's source files. Those paths are what the staleness
 * check reads from the working tree, so the fixture project below actually
 * creates them - a manifest pointing at files that do not exist would make the
 * digest a constant and the check vacuous.
 */
const APP_SOURCE_FILES = ['src/App.tsx', 'src/Button.stories.tsx'];

/** Storybook's config directory: the requires file is GENERATED from the rest. */
const STORYBOOK_MAIN = '.rnstorybook/main.ts';
const STORYBOOK_REQUIRES = '.rnstorybook/storybook.requires.ts';

const MANIFEST_BYTES = Buffer.from(
  JSON.stringify({
    version: 1,
    header: {
      metroVersion: '0.81.0',
      generatedFiles: {
        [STORYBOOK_REQUIRES]: { generatedBy: 'storybook-requires', inputs: [STORYBOOK_MAIN] },
      },
    },
    moduleHashes: {
      'src/App.tsx': 'abc',
      'src/Button.stories.tsx': 'def',
      [STORYBOOK_REQUIRES]: 'req',
      // A dependency module: excluded from the app-source digest, because
      // dependency bytes are already covered by the dependency closure.
      'node_modules/react-native/index.js': 'ghi',
    },
    storyClosures: { 'src/Button.stories.tsx': ['Button/Primary'] },
  })
);

/** The gate metadata the emitting machine derives beside the bundle. */
const EMITTED_GATE_METADATA: GateMetadataInput = {
  derivedFrom: 'source',
  engineClass: 'hermes',
  bundleFormat: 'plain-js',
  requiredSdkProtocolVersion: '2.1.0',
};

/** What the emitting machine computed for the tree's base fingerprint. */
const EMITTED_BASE_FINGERPRINT: BaseFingerprintResult = {
  hash: 'base-from-emit',
  nativeFingerprint: 'native-from-emit',
  preimage: {
    workflow: 'bare',
    nativeSources: [{ type: 'dir', id: 'ios', hash: 'h' }],
    lockfiles: [],
    autolinkedModules: [],
  },
};

function write(relativePath: string, text: string): void {
  const fullPath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text);
}

/** A yarn berry lockfile resolving exactly the given packages. */
function berryLockfile(packages: Record<string, string>): string {
  const blocks = Object.entries(packages).map(
    ([name, version]) =>
      `"${name}@npm:^${version}":\n  version: ${version}\n  resolution: "${name}@npm:${version}"\n  languageName: node\n  linkType: hard\n`
  );
  return `__metadata:\n  version: 8\n  cacheKey: 10\n\n${blocks.join('\n')}`;
}

/** The lockfile of a project that resolves react-native, a platform binary and the SDK. */
const LOCKED_PACKAGES = {
  'react-native': '0.76.0',
  metro: '0.81.0',
  '@sherlo/react-native-storybook': '2.1.0',
  '@esbuild/darwin-arm64': '0.27.3',
  'lightningcss-linux-x64-gnu': '1.30.0',
};

/** Install a package the way the emitting machine's OS would - and only that one. */
function installPackage(name: string, version: string): void {
  write(`node_modules/${name}/package.json`, JSON.stringify({ name, version }));
}

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-supplied-'));
  projectRoot = path.join(root, 'project');
  bundleDir = path.join(root, 'supplied');
  bundlerOut = path.join(root, 'bundler-out');

  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(bundlerOut, { recursive: true });

  write('package.json', JSON.stringify({ dependencies: { 'react-native': '0.76.0' } }));
  write('babel.config.js', 'module.exports = {};');
  write('ios/Podfile', 'platform :ios');

  for (const sourceFile of APP_SOURCE_FILES) {
    write(sourceFile, `// ${sourceFile}\n`);
  }
  write(STORYBOOK_MAIN, "export default { stories: ['../src/**/*.stories.tsx'] };\n");
  write(STORYBOOK_REQUIRES, '/* do not change this file, it is auto generated by storybook. */\n');

  mockGetPackageVersion.mockReturnValue('0.76.0');
  mockReadBundledSdkProtocolVersion.mockReturnValue('2.1.0');
});

afterEach(() => {
  fs.rmSync(path.dirname(projectRoot), { recursive: true, force: true });
  vi.clearAllMocks();
});

/**
 * A scripted bundler run: writes a bundle and one asset to disk and returns the
 * BundleResult the real producer would have returned for them.
 */
function scriptedBundle(
  platform: Platform,
  opts: { withManifest?: boolean; withAssets?: boolean } = {}
): BundleResult {
  const { withManifest = true, withAssets = true } = opts;

  const bundlePath = path.join(bundlerOut, `bundle.${platform}.js`);
  fs.writeFileSync(bundlePath, `var __BUNDLE_START__;// ${platform}\n`);

  let assetsDest: string | undefined;
  if (withAssets) {
    assetsDest = path.join(bundlerOut, `assets.${platform}`);
    fs.mkdirSync(path.join(assetsDest, 'drawable-mdpi'), { recursive: true });
    fs.writeFileSync(path.join(assetsDest, 'drawable-mdpi', 'logo.png'), 'png-bytes');
  }

  const buffer = fs.readFileSync(bundlePath);

  return {
    bundlePath,
    bundleFormat: 'plain-js',
    bundleSizeMb: parseFloat((buffer.length / (1024 * 1024)).toFixed(2)),
    bundleHash: 'irrelevant-the-emitter-rehashes',
    ...(assetsDest ? { assetsDest } : {}),
    assetInventory: withAssets ? ['drawable-mdpi/logo.png'] : [],
    bundler: 'rn' as const,
    // The parsed half is derived from the raw bytes, exactly as the real reader
    // derives it. A hand-stubbed `parsed` would let the fixture disagree with its
    // own manifest, and the app-source digest reads the module list from it.
    ...(withManifest
      ? {
          moduleManifest: {
            raw: MANIFEST_BYTES,
            parsed: JSON.parse(MANIFEST_BYTES.toString('utf8')),
          },
        }
      : {}),
  };
}

/** Emit a directory for `platforms`, using the scripted bundler above. */
async function emit(
  platforms: Platform[],
  opts: {
    withManifest?: boolean;
    withAssets?: boolean;
    baseFingerprint?: BaseFingerprintResult;
  } = {}
): Promise<void> {
  await emitBundleDir({
    projectRoot,
    platformsToTest: platforms,
    bundleDir,
    ...(opts.baseFingerprint ? { baseFingerprint: opts.baseFingerprint } : {}),
    bundleFor: async (_root, platform) => scriptedBundle(platform, opts),
    gateMetadataFor: async () => EMITTED_GATE_METADATA,
  });
}

function accept(platform: Platform, baseFingerprint?: string) {
  return resolveSuppliedBundle({
    bundleDir,
    projectRoot,
    platform,
    ...(baseFingerprint ? { baseFingerprint } : {}),
  });
}

/** Accept a bundle that is expected to be refused, and hand back the refusal. */
async function refusalFrom(platform: Platform): Promise<Error> {
  try {
    await accept(platform);
  } catch (error) {
    return error as Error;
  }
  throw new Error(`Expected the ${platform} bundle to be refused, but it was accepted`);
}

function readSidecar(platform: Platform): any {
  return JSON.parse(fs.readFileSync(path.join(bundleDir, sidecarFileName(platform)), 'utf8'));
}

function writeSidecar(platform: Platform, sidecar: unknown): void {
  fs.writeFileSync(
    path.join(bundleDir, sidecarFileName(platform)),
    JSON.stringify(sidecar, null, 2)
  );
}

// ---------------------------------------------------------------------------
// The round trip
// ---------------------------------------------------------------------------

describe('emit then accept', () => {
  it('round-trips the bundle and the manifest byte-identically', async () => {
    await emit(['android']);

    const emittedBundle = fs.readFileSync(path.join(bundleDir, bundleFileName('android')));
    const emittedManifest = fs.readFileSync(
      path.join(bundleDir, moduleManifestFileName('android'))
    );

    const { result } = await accept('android');

    // The bytes the acceptor hands downstream are the bytes the producer wrote.
    expect(fs.readFileSync(result.bundlePath)).toEqual(emittedBundle);
    expect(result.moduleManifest?.raw).toEqual(emittedManifest);
    expect(emittedManifest).toEqual(MANIFEST_BYTES);
  });

  it('produces the same BundleResult shape the bundling road produces', async () => {
    await emit(['android']);

    const { result } = await accept('android');

    expect(result.bundleFormat).toBe('plain-js');
    expect(result.bundler).toBe('rn');
    expect(result.assetInventory).toEqual(['drawable-mdpi/logo.png']);
    expect(result.assetsDest).toBeDefined();
    expect(result.moduleManifest).toBeDefined();
  });

  it('hands back the gate metadata the emitting machine derived beside the bundle', async () => {
    await emit(['android']);

    const { gateMetadata } = await accept('android');

    expect(gateMetadata).toEqual(EMITTED_GATE_METADATA);
  });

  it('keeps each platform in its own slot, so one directory carries both', async () => {
    await emit(['android', 'ios']);

    const android = await accept('android');
    const ios = await accept('ios');

    expect(readSidecar('android').platform).toBe('android');
    expect(readSidecar('ios').platform).toBe('ios');
    // Different bundles, not the same file read twice.
    expect(fs.readFileSync(android.result.bundlePath)).not.toEqual(
      fs.readFileSync(ios.result.bundlePath)
    );
  });

  it('accepts a bundle for an app with no assets at all', async () => {
    await emit(['android'], { withAssets: false });

    const { result } = await accept('android');

    expect(result.assetInventory).toEqual([]);
    expect(result.assetsDest).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The accepting machine is a bare checkout
// ---------------------------------------------------------------------------

describe('accepting on a machine that never bundled and never installed', () => {
  it('accepts after the generated storybook.requires file is deleted', async () => {
    await emit(['android']);

    // The accepting checkout does not track the generated file, and no bundler
    // ran there to write it. Its inputs are what the digest covers.
    fs.rmSync(path.join(projectRoot, STORYBOOK_REQUIRES));

    await expect(accept('android')).resolves.toBeDefined();
  });

  it('refuses when an input of the generated file changed, naming the input', async () => {
    await emit(['android']);
    fs.rmSync(path.join(projectRoot, STORYBOOK_REQUIRES));
    write(STORYBOOK_MAIN, "export default { stories: ['../src/**/*.stories.tsx'], addons: [] };\n");

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/app source:/);
    expect(error.message).toMatch(/~ \.rnstorybook\/main\.ts [0-9a-f]{12} -> [0-9a-f]{12}/);
    expect(error.message).not.toMatch(/storybook\.requires/);
  });

  it('digests the generated file by its inputs on both sides, so the digests agree', async () => {
    await emit(['android']);
    const withGeneratedFile = readSidecar('android').appSource;

    // A second emit on a tree where the generated file's bytes differ (a rerun
    // of the generator with different whitespace) but its inputs do not.
    write(STORYBOOK_REQUIRES, '// regenerated with different bytes\n');
    await emit(['android']);
    const regenerated = readSidecar('android').appSource;

    expect(regenerated.hash).toBe(withGeneratedFile.hash);
    expect(regenerated.files.map((file: any) => file.path)).toEqual([
      STORYBOOK_MAIN,
      'src/App.tsx',
      'src/Button.stories.tsx',
    ]);
  });

  it('accepts with lockfile-identical trees when the emitting OS installed a platform binary and the accepting one installed nothing', async () => {
    write('yarn.lock', berryLockfile(LOCKED_PACKAGES));
    installPackage('react-native', '0.76.0');
    installPackage('@esbuild/darwin-arm64', '0.27.3');
    await emit(['android']);

    // The accepting machine: the same lockfile, no install at all.
    fs.rmSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    mockGetPackageVersion.mockReturnValue(null);
    mockReadBundledSdkProtocolVersion.mockReturnValue(undefined);

    await expect(accept('android')).resolves.toBeDefined();
    expect(readSidecar('android').project.dependencyClosure.source).toBe('yarn.lock');
  });

  it('reads the toolchain versions from the lockfile, so they agree with no install', async () => {
    write('yarn.lock', berryLockfile(LOCKED_PACKAGES));
    mockGetPackageVersion.mockReturnValue(null);
    mockReadBundledSdkProtocolVersion.mockReturnValue(undefined);
    await emit(['android']);

    const { project } = readSidecar('android');

    expect(project.reactNativeVersion).toBe('0.76.0');
    expect(project.metroVersion).toBe('0.81.0');
    expect(project.requiredSdkProtocolVersion).toBe('2.1.0');
  });

  it('refuses when the lockfile changed, naming the package that moved', async () => {
    write('yarn.lock', berryLockfile(LOCKED_PACKAGES));
    await emit(['android']);

    write('yarn.lock', berryLockfile({ ...LOCKED_PACKAGES, 'react-native': '0.77.0' }));

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/dependencies: the packages resolved in yarn\.lock differ/);
    expect(error.message).toContain('~ react-native 0.76.0 -> 0.77.0');
    // The lockfile also names the React Native version the identity compares.
    expect(error.message).toMatch(/React Native version: the bundle was built with 0\.76\.0/);
  });

  it('proceeds with the recorded base fingerprint and gate metadata after node_modules is deleted', async () => {
    write('yarn.lock', berryLockfile(LOCKED_PACKAGES));
    installPackage('react-native', '0.76.0');
    await emit(['android'], { baseFingerprint: EMITTED_BASE_FINGERPRINT });

    fs.rmSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    mockGetPackageVersion.mockReturnValue(null);
    mockReadBundledSdkProtocolVersion.mockReturnValue(undefined);

    // The routing decision rests on these two - the same base, the same identity
    // the emitting machine would have sent.
    const { gateMetadata, notes } = await accept('android', 'base-from-emit');
    expect(gateMetadata).toEqual(EMITTED_GATE_METADATA);
    expect(notes).toEqual([]);
    expect(readSidecar('android').baseFingerprint).toEqual({
      hash: 'base-from-emit',
      nativeFingerprint: 'native-from-emit',
      // The dir source, the config file - and the lockfiles the preimage names,
      // which this scripted one does not.
      nativeInputs: { paths: ['ios', 'package.json'], digest: expect.any(String) },
    });
  });
});

// ---------------------------------------------------------------------------
// The triple must be complete
// ---------------------------------------------------------------------------

describe('an incomplete directory is refused', () => {
  it('refuses a missing module manifest by name, rather than bundling around it', async () => {
    await emit(['android']);
    fs.rmSync(path.join(bundleDir, moduleManifestFileName('android')));

    await expect(accept('android')).rejects.toThrow(/the module manifest/);
  });

  it('refuses a missing sidecar by name', async () => {
    await emit(['android']);
    fs.rmSync(path.join(bundleDir, sidecarFileName('android')));

    await expect(accept('android')).rejects.toThrow(/the sidecar/);
  });

  it('refuses a missing bundle by name', async () => {
    await emit(['android']);
    fs.rmSync(path.join(bundleDir, bundleFileName('android')));

    await expect(accept('android')).rejects.toThrow(/the bundle/);
  });

  it('names EVERY missing piece at once, so one pass fixes them', async () => {
    await emit(['android']);
    fs.rmSync(path.join(bundleDir, moduleManifestFileName('android')));
    fs.rmSync(path.join(bundleDir, sidecarFileName('android')));

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/the module manifest/);
    expect(error.message).toMatch(/the sidecar/);
  });

  it('refuses a platform the directory was never emitted for', async () => {
    await emit(['android']);

    await expect(accept('ios')).rejects.toThrow(/no complete ios bundle/);
  });

  it('refuses a directory that does not exist', async () => {
    await expect(accept('android')).rejects.toThrow(/does not exist/);
  });
});

// ---------------------------------------------------------------------------
// Sidecar mismatches, one refusal each
// ---------------------------------------------------------------------------

describe('a sidecar that does not match is refused by field', () => {
  it('refuses a bundle built for the other platform', async () => {
    await emit(['android', 'ios']);

    // The exact accident the sidecar exists to catch: the right files under the
    // wrong name. Nothing in the bundle bytes could ever detect this.
    const androidSidecar = readSidecar('android');
    fs.copyFileSync(
      path.join(bundleDir, bundleFileName('android')),
      path.join(bundleDir, bundleFileName('ios'))
    );
    fs.copyFileSync(
      path.join(bundleDir, moduleManifestFileName('android')),
      path.join(bundleDir, moduleManifestFileName('ios'))
    );
    writeSidecar('ios', androidSidecar);

    const error = await refusalFrom('ios');

    expect(error.message).toMatch(/platform:/);
    expect(error.message).toMatch(/built for android/);
  });

  it('refuses a bundle whose bytes changed after it was recorded', async () => {
    await emit(['android']);
    fs.appendFileSync(path.join(bundleDir, bundleFileName('android')), '// tampered\n');

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/bundle contents:/);
  });

  it('refuses a manifest whose bytes changed after it was recorded', async () => {
    await emit(['android']);
    fs.writeFileSync(
      path.join(bundleDir, moduleManifestFileName('android')),
      JSON.stringify({ version: 1, header: {}, moduleHashes: {}, storyClosures: {} })
    );

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/module manifest contents:/);
  });

  it('refuses when assets went missing from the directory', async () => {
    await emit(['android']);
    fs.rmSync(path.join(bundleDir, 'assets.android'), { recursive: true, force: true });

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/assets:/);
  });

  it('refuses a different React Native version, by name', async () => {
    await emit(['android']);
    mockGetPackageVersion.mockReturnValue('0.77.0');

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/React Native version: the bundle was built with 0\.76\.0/);
    expect(error.message).toMatch(/this project has 0\.77\.0/);
  });

  it('refuses a different Sherlo SDK protocol version, by name', async () => {
    await emit(['android']);
    mockReadBundledSdkProtocolVersion.mockReturnValue('3.0.0');

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/Sherlo SDK protocol version:/);
  });

  it('refuses a changed babel config, by name', async () => {
    await emit(['android']);
    write('babel.config.js', 'module.exports = { presets: ["module:metro-react-native-babel-preset"] };');

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/Babel config:/);
  });

  it('refuses a changed dependency set, by name', async () => {
    await emit(['android']);
    write('package.json', JSON.stringify({ dependencies: { 'react-native': '0.76.0', lodash: '4.17.21' } }));

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/dependencies: the dependencies declared in package\.json differ/);
  });

  it('reports the dependency SOURCE change on its own, since two sources cannot be compared', async () => {
    await emit(['android']);
    // The project gains a lockfile, so its closure is now measured differently.
    write('yarn.lock', berryLockfile(LOCKED_PACKAGES));

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/dependency closure:/);
    expect(error.message).toMatch(/read from package\.json, this project's from yarn\.lock/);
    expect(error.message).toMatch(/cannot be compared/);
  });

  it('names EVERY mismatched field at once, so one pass fixes them', async () => {
    await emit(['android']);
    mockGetPackageVersion.mockReturnValue('0.77.0');
    mockReadBundledSdkProtocolVersion.mockReturnValue('3.0.0');

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/React Native version:/);
    expect(error.message).toMatch(/Sherlo SDK protocol version:/);
  });

  // The staleness check. Everything else answers "was this bundle built for this
  // project?"; only this answers "was it built from this project's CURRENT code".
  it('refuses a bundle built before a source file was edited, naming the file', async () => {
    await emit(['android']);

    // Exactly what a variant push does: rewrite a screen, change nothing else.
    write('src/App.tsx', '// App.tsx, now with a visible change\n');

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/app source:/);
    expect(error.message).toMatch(/BEFORE those edits/);
    expect(error.message).toMatch(/~ src\/App\.tsx [0-9a-f]{12} -> [0-9a-f]{12}/);
  });

  it('refuses a bundle whose source file has since been deleted', async () => {
    await emit(['android']);
    fs.rmSync(path.join(projectRoot, 'src/Button.stories.tsx'));

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/app source:/);
    expect(error.message).toMatch(/~ src\/Button\.stories\.tsx [0-9a-f]{12} -> missing/);
  });

  it('ignores dependency files when digesting app source', async () => {
    await emit(['android']);

    // The manifest names a node_modules module. Dependency bytes are covered by
    // the dependency closure, so materializing one must not move the app digest.
    write('node_modules/react-native/index.js', 'module.exports = {};');
    installPackage('react-native', '0.76.0');

    const error = await refusalFrom('android');

    // It still refuses - a node_modules tree appeared, so the DEPENDENCY closure
    // legitimately changed - but the app source must not be what it complains of.
    expect(error.message).toMatch(/dependency closure:|dependencies:/);
    expect(error.message).not.toMatch(/app source:/);
  });

  it('accepts when the source is untouched, so the check is not vacuous', async () => {
    await emit(['android']);

    await expect(accept('android')).resolves.toBeDefined();
  });

  it('refuses a sidecar written by a future CLI rather than guessing its fields', async () => {
    await emit(['android']);
    writeSidecar('android', { ...readSidecar('android'), sidecarVersion: 99 });

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/declares version 99/);
  });

  it('refuses an unparseable sidecar', async () => {
    await emit(['android']);
    fs.writeFileSync(path.join(bundleDir, sidecarFileName('android')), 'not json at all');

    await expect(accept('android')).rejects.toThrow(/not valid JSON/);
  });

  it('every refusal carries the full-run fallback line', async () => {
    await emit(['android']);
    mockGetPackageVersion.mockReturnValue('0.77.0');

    const error = await refusalFrom('android');

    expect(error.message).toMatch(/full build/i);
  });
});

// ---------------------------------------------------------------------------
// The one thing that is NOT a refusal
// ---------------------------------------------------------------------------

describe('the base fingerprint', () => {
  it('notes a different native base without refusing - the gate judges pairing', async () => {
    await emit(['android'], { baseFingerprint: EMITTED_BASE_FINGERPRINT });

    const { result, notes } = await accept('android', 'a-different-fingerprint');

    // A native-only change must not throw away a perfectly good supplied bundle.
    expect(result.bundleFormat).toBe('plain-js');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/different native base/);
  });

  it('says nothing when the native base matches', async () => {
    await emit(['android'], { baseFingerprint: EMITTED_BASE_FINGERPRINT });

    const { notes } = await accept('android', 'base-from-emit');

    expect(notes).toEqual([]);
  });

  it('records null when the emitting machine computed none', async () => {
    await emit(['android']);

    expect(readSidecar('android').baseFingerprint).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The producer refuses to write something that could only be refused later
// ---------------------------------------------------------------------------

describe('emit', () => {
  it('refuses to emit a bundle with no module manifest', async () => {
    // Emitting this would produce a directory every accept run would reject. Fail
    // now, while the cause is on screen, not in someone else's CI next week.
    await expect(emit(['android'], { withManifest: false })).rejects.toThrow(
      /No module manifest was produced/
    );
  });

  it('records the platform, the entry file and the bundler in the sidecar', async () => {
    await emit(['android']);

    const sidecar = readSidecar('android');

    expect(sidecar.platform).toBe('android');
    expect(sidecar.bundle.entryFile).toBe('index.js');
    expect(sidecar.bundle.bundler).toBe('rn');
    expect(sidecar.bundle.format).toBe('plain-js');
  });

  it('records the project identity the acceptor will check', async () => {
    await emit(['android']);

    const sidecar = readSidecar('android');

    expect(sidecar.project.reactNativeVersion).toBe('0.76.0');
    expect(sidecar.project.requiredSdkProtocolVersion).toBe('2.1.0');
    expect(sidecar.project.babelConfigDigest).toEqual(expect.any(String));
    expect(sidecar.project.dependencyClosure.source).toBe('package.json');
    expect(sidecar.project.dependencyClosure.hash).toEqual(expect.any(String));
    expect(sidecar.project.dependencyClosure.packages).toBeNull();
  });

  it('records the app source digest over the graph, excluding dependencies', async () => {
    await emit(['android']);

    const sidecar = readSidecar('android');

    expect(sidecar.appSource.source).toBe('module-graph');
    expect(sidecar.appSource.hash).toEqual(expect.any(String));
    // The manifest names four modules; the node_modules one is not app source and
    // the generated one stands for its single input.
    expect(sidecar.appSource.fileCount).toBe(APP_SOURCE_FILES.length + 1);
  });

  it('writes the closure pre-images, so a refusal can name what moved', async () => {
    write('yarn.lock', berryLockfile(LOCKED_PACKAGES));
    await emit(['android']);

    const sidecar = readSidecar('android');

    expect(sidecar.project.dependencyClosure.packages).toContainEqual({
      name: 'react-native',
      versions: ['0.76.0'],
    });
    expect(sidecar.appSource.files).toContainEqual({
      path: 'src/App.tsx',
      digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('overwrites a previous emit rather than merging into it', async () => {
    await emit(['android']);
    const first = readSidecar('android');

    // A second emit with a different asset set must not leave the first one's
    // assets behind - a stale file would fail the inventory check confusingly.
    await emit(['android'], { withAssets: false });
    const second = readSidecar('android');

    expect(first.assets.dir).toBe('assets.android');
    expect(second.assets.dir).toBeNull();
    expect(fs.existsSync(path.join(bundleDir, 'assets.android'))).toBe(false);
    await expect(accept('android')).resolves.toBeDefined();
  });
});
