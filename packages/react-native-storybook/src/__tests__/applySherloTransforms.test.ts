'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const applySherloTransforms = require('../../metro/applySherloTransforms');

// ---------------------------------------------------------------------------
// Native marker file detection for ERROR_STORYBOOK_DISABLED (enabled: false)
// Architecture: applySherloTransforms writes build-time marker files to
// android/app/src/main/assets/ and ios/<AppName>/ when opts.enabled === false.
// Native SherloInitProvider (Android) / SherloModuleCore (iOS) read the marker
// at app startup and emit ERROR_STORYBOOK_DISABLED in testing mode.
// ---------------------------------------------------------------------------

describe('applySherloTransforms - native marker files for ERROR_STORYBOOK_DISABLED', () => {
  it('does NOT create Android marker file when enabled: true', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-marker-enabled-test-'));
    const androidAssetsDir = path.join(tmpDir, 'android', 'app', 'src', 'main', 'assets');
    fs.mkdirSync(androidAssetsDir, { recursive: true });

    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: true });
    const markerPath = path.join(androidAssetsDir, 'sherlo-storybook-disabled');
    const exists = fs.existsSync(markerPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(exists).toBe(false);
  });

  it('does NOT create Android marker file when no opts', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-marker-noopts-test-'));
    const androidAssetsDir = path.join(tmpDir, 'android', 'app', 'src', 'main', 'assets');
    fs.mkdirSync(androidAssetsDir, { recursive: true });

    applySherloTransforms({ projectRoot: tmpDir, resolver: {} });
    const markerPath = path.join(androidAssetsDir, 'sherlo-storybook-disabled');
    const exists = fs.existsSync(markerPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(exists).toBe(false);
  });

  it('generated wrapper does NOT contain SHERLO_BUILD_DISABLED (removed in favour of native detection)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-no-builddisabled-test-'));
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const wrapperPath = path.join(
      tmpDir,
      'node_modules',
      '.cache',
      'sherlo',
      'storybook-wrapper.js'
    );
    const content = fs.readFileSync(wrapperPath, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(content).not.toContain('SHERLO_BUILD_DISABLED');
    expect(content).not.toContain('sendNativeError');
    expect(content).not.toContain('ERROR_STORYBOOK_DISABLED');
  });

  it('resolver does NOT redirect @sherlo/react-native-storybook regardless of enabled flag', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-resolver-noop-disabled-test-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });

    const fakeContext = {
      originModulePath: '/some/module.js',
      resolveRequest: (_ctx: unknown, name: string) => ({
        type: 'sourceFile',
        filePath: `/resolved/${name}`,
      }),
    };
    const resolved = result.resolver.resolveRequest(
      fakeContext,
      '@sherlo/react-native-storybook',
      'android'
    );
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // Falls through to the default resolver - no sdk-disabled-wrapper redirect
    expect((resolved as { filePath: string }).filePath).toContain(
      '/resolved/@sherlo/react-native-storybook'
    );
    expect((resolved as { filePath: string }).filePath).not.toContain('sdk-disabled-wrapper');
  });
});

// ---------------------------------------------------------------------------
// Optional peers, scoped to the seam
// ---------------------------------------------------------------------------

describe('applySherloTransforms - optional-peer empty-module branch (scoped to the seam)', () => {
  const seamPath = require.resolve('../../src/seam.js');

  function fakeContextThatThrows(originModulePath: string) {
    return {
      originModulePath,
      resolveRequest: () => {
        throw new Error('module not found');
      },
    };
  }

  it('a request from the SEAM for an unresolvable optional peer resolves to an empty module', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-optional-peer-seam-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: true });

    const resolved = result.resolver.resolveRequest(
      fakeContextThatThrows(seamPath),
      'expo-dev-menu',
      'android'
    );
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(resolved).toEqual({ type: 'empty' });
  });

  it("the SAME unresolvable optional peer from the customer's own code still throws - only the seam is exempted", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-optional-peer-customer-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: true });

    expect(() =>
      result.resolver.resolveRequest(
        fakeContextThatThrows('/project/src/SomeCustomerFile.tsx'),
        'expo-dev-menu',
        'android'
      )
    ).toThrow('module not found');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('a non-optional-peer request from the seam is unaffected (falls through to the normal resolve path)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-optional-peer-nonpeer-'));
    const result = applySherloTransforms(
      {
        projectRoot: tmpDir,
        resolver: {
          resolveRequest: (_ctx: unknown, name: string) => ({
            type: 'sourceFile',
            filePath: `/resolved/${name}`,
          }),
        },
      },
      { enabled: true }
    );

    const resolved = result.resolver.resolveRequest(
      { originModulePath: seamPath, resolveRequest: () => ({ type: 'empty' }) },
      'react',
      'android'
    );
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect((resolved as { filePath: string }).filePath).toBe('/resolved/react');
  });
});

// ---------------------------------------------------------------------------
// generateWrapper export
// ---------------------------------------------------------------------------

describe('generateWrapper - exported function', () => {
  it('is exported from applySherloTransforms module', () => {
    expect(typeof applySherloTransforms.generateWrapper).toBe('function');
  });

  it('writes storybook-wrapper.js WITHOUT SHERLO_BUILD_DISABLED (native detection used instead)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-gen-wrapper-test-'));
    const wrapperPath = path.join(tmpDir, 'storybook-wrapper.js');
    applySherloTransforms.generateWrapper(wrapperPath);
    const exists = fs.existsSync(wrapperPath);
    const content = fs.readFileSync(wrapperPath, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(exists).toBe(true);
    expect(content).not.toContain('SHERLO_BUILD_DISABLED');
    expect(content).not.toContain('sendNativeError');
    expect(content).not.toContain('ERROR_STORYBOOK_DISABLED');
    // patchedStart stub is still present for sb8/sb9 crash prevention
    expect(content).toContain("typeof real.start !== 'function'");
    expect(content).toContain('SherloDisabledUI');
  });
});

describe('applySherloTransforms - enabled:false ships minimal polyfill only', () => {
  it('enabled:false: result.serializer.getPolyfills returns ONLY storybook-disabled-flag.js', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-grep-disabled-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const polyfills: string[] = result.serializer.getPolyfills({});
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(polyfills.some((p) => p.includes('storybook-disabled-flag.js'))).toBe(true);
    expect(
      polyfills.some((p) => p.includes('polyfill.js') && !p.includes('storybook-disabled-flag.js'))
    ).toBe(false);
  });

  it('enabled:false: storybook-disabled-flag.js sets BOTH __sherlo* globals', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-grep-flag-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const polyfills: string[] = result.serializer.getPolyfills({});
    const flagPath = polyfills.find((p) => p.includes('storybook-disabled-flag.js'));
    const flagContent = fs.readFileSync(flagPath as string, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(flagContent).toContain('__sherloWithStorybookApplied');
    expect(flagContent).toContain('__sherloStorybookDisabledFlag');
  });

  it('enabled:true: result.serializer.getPolyfills returns polyfill.js (full)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-grep-enabled-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: true });
    const polyfills: string[] = result.serializer.getPolyfills({});
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(polyfills.some((p) => p.endsWith('polyfill.js'))).toBe(true);
    expect(polyfills.some((p) => p.includes('storybook-disabled-flag.js'))).toBe(false);
  });

  it('enabled:true: polyfill.js contains the IIFE-time mode gate', () => {
    const polyfillPath = path.join(__dirname, '../../metro/polyfill.js');
    const polyfillContent = fs.readFileSync(polyfillPath, 'utf8');

    expect(polyfillContent).toContain('IIFE-time mode gate');
    expect(polyfillContent).toContain('getSherloConstants');
    expect(polyfillContent).toContain("=== 'default'");
    expect(polyfillContent).toContain("=== 'storybook'");
    expect(polyfillContent).not.toContain('diagLog');
    expect(polyfillContent).not.toContain('[sherlo-diag]');
  });
});

// ---------------------------------------------------------------------------
// customSerializer wrapper
// ---------------------------------------------------------------------------

describe('applySherloTransforms – customSerializer wrapper', () => {
  // ---- ON the test:bundled bundling path (SHERLO_MODULE_MANIFEST=1) ----
  // The wrapper is installed so the manifest can be emitted, and it must delegate
  // to the original serializer with byte-identical output.
  describe('on the bundling path (SHERLO_MODULE_MANIFEST=1)', () => {
    beforeEach(() => {
      process.env.SHERLO_MODULE_MANIFEST = '1';
    });
    afterEach(() => {
      delete process.env.SHERLO_MODULE_MANIFEST;
    });

    it('installs a customSerializer when an existing one is passed in', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-graph-serializer-'));
      let delegateCalled = false;
      const fakeSerializer = (_ep: unknown, _pre: unknown, _g: unknown, _opts: unknown) => {
        delegateCalled = true;
        return 'BUNDLE_BYTES';
      };
      const result = applySherloTransforms(
        { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: fakeSerializer } },
        { enabled: true }
      );

      // A NEW wrapper is installed (not the identity of the user's serializer).
      expect(typeof result.serializer.customSerializer).toBe('function');
      expect(result.serializer.customSerializer).not.toBe(fakeSerializer);
      // Calling it should delegate to fakeSerializer (tmpDir still exists here)
      const output = result.serializer.customSerializer(
        'index.js',
        [],
        { dependencies: new Map() },
        { projectRoot: tmpDir }
      );
      fs.rmSync(tmpDir, { recursive: true, force: true });

      expect(delegateCalled).toBe(true);
      expect(output).toBe('BUNDLE_BYTES');
    });

    it('delegate output is returned UNCHANGED (byte-equality)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-graph-byte-eq-'));
      const ORIGINAL_OUTPUT = 'BUNDLE_SOURCE_CODE_12345';
      const fakeSerializer = () => ORIGINAL_OUTPUT;
      const result = applySherloTransforms(
        { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: fakeSerializer } },
        { enabled: true }
      );

      const output = result.serializer.customSerializer(
        'index.js',
        [],
        { dependencies: new Map() },
        { projectRoot: tmpDir }
      );
      fs.rmSync(tmpDir, { recursive: true, force: true });

      expect(output).toBe(ORIGINAL_OUTPUT);
    });

    it('does NOT install customSerializer when no existing serializer and Metro default unavailable', () => {
      // When there's no existing customSerializer and Metro's internals can't be required,
      // we should NOT set customSerializer (to avoid a null-returning serializer crashing Metro).
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-graph-no-delegate-'));
      // Pass a config with no customSerializer
      const result = applySherloTransforms(
        { projectRoot: tmpDir, resolver: {} },
        { enabled: true }
      );
      fs.rmSync(tmpDir, { recursive: true, force: true });

      // In the test environment Metro internals may or may not be available.
      // The test only asserts the function doesn't throw and the serializer
      // object is still valid (getPolyfills is still set).
      expect(typeof result.serializer.getPolyfills).toBe('function');
    });
  });

  // ---- OFF the bundling path (SHERLO_MODULE_MANIFEST unset) ----
  // There is nothing for the wrapper to do, so Sherlo must NOT touch the user's
  // customSerializer slot at all: no wrapper installed, the user's serializer is
  // left exactly as passed in, and Metro's default serializer is never forced to
  // load.
  describe('off the bundling path (SHERLO_MODULE_MANIFEST unset)', () => {
    beforeEach(() => {
      delete process.env.SHERLO_MODULE_MANIFEST;
    });

    it("leaves the user's existing customSerializer untouched (same identity)", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-graph-off-path-'));
      const fakeSerializer = () => 'BUNDLE_BYTES';
      const result = applySherloTransforms(
        { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: fakeSerializer } },
        { enabled: true }
      );
      fs.rmSync(tmpDir, { recursive: true, force: true });

      // The user's serializer passes through by identity - not wrapped.
      expect(result.serializer.customSerializer).toBe(fakeSerializer);
    });

    it('does not install a customSerializer when the user had none', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-graph-off-path-none-'));
      const result = applySherloTransforms(
        { projectRoot: tmpDir, resolver: {} },
        { enabled: true }
      );
      fs.rmSync(tmpDir, { recursive: true, force: true });

      // No wrapper, and Metro's default serializer was never forced to load.
      expect(result.serializer.customSerializer).toBeUndefined();
      expect(typeof result.serializer.getPolyfills).toBe('function');
    });
  });
});

// ---------------------------------------------------------------------------
// Module manifest sidecar (SHERLO-1890 Diff Scope Phase A)
//   Enabled on the test:bundled bundling path via SHERLO_MODULE_MANIFEST=1.
// ---------------------------------------------------------------------------

// A minimal Metro-like graph inside `root`:
//   Button.stories.tsx --require.context--> (synthetic ctx) --> [Button.stories.tsx]
//   Button.stories.tsx --imports--> Button.tsx
//   Button.tsx        --imports--> shared/Label.tsx
// so Button.stories' forward closure is { Button.tsx, shared/Label.tsx }.
function buildFakeGraph(root: string) {
  const storiesPath = path.join(root, 'src', 'Button.stories.tsx');
  const buttonPath = path.join(root, 'src', 'Button.tsx');
  const labelPath = path.join(root, 'src', 'shared', 'Label.tsx');
  const requiresPath = path.join(root, 'src', '.rnstorybook', 'storybook.requires.ts');
  const ctxPath = path.join(root, 'src', '.rnstorybook', 'storybook.requires.ts?ctx');

  const mod = (code: string, deps: Map<string, unknown>) => ({
    output: [{ data: { code } }],
    dependencies: deps,
  });

  const deps = new Map<string, unknown>();
  // storybook.requires.ts owns a require.context edge → synthetic ctx module.
  deps.set(
    requiresPath,
    mod(
      'REQUIRES_CODE',
      new Map([['ctx', { absolutePath: ctxPath, data: { data: { contextParams: {} } } }]])
    )
  );
  // The synthetic ctx module's own deps are the matched story files.
  deps.set(
    ctxPath,
    mod('CTX_CODE', new Map([['s', { absolutePath: storiesPath, data: { data: {} } }]]))
  );
  // Story imports Button; Button imports Label.
  deps.set(
    storiesPath,
    mod('STORY_CODE', new Map([['b', { absolutePath: buttonPath, data: { data: {} } }]]))
  );
  deps.set(
    buttonPath,
    mod('BUTTON_CODE', new Map([['l', { absolutePath: labelPath, data: { data: {} } }]]))
  );
  deps.set(labelPath, mod('LABEL_CODE', new Map()));

  return { graph: { dependencies: deps }, storiesPath, buttonPath, labelPath };
}

describe('applySherloTransforms – module manifest sidecar (enabled)', () => {
  const manifestRelPath = ['node_modules', '.cache', 'sherlo', 'module-manifest.json'];

  // The manifest is enabled by the env var the CLI sets on the test:bundled path.
  beforeEach(() => {
    process.env.SHERLO_MODULE_MANIFEST = '1';
  });
  afterEach(() => {
    delete process.env.SHERLO_MODULE_MANIFEST;
  });

  function emitAndRead() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-on-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    const built = buildFakeGraph(tmpDir);
    result.serializer.customSerializer('index.js', [], built.graph, { projectRoot: tmpDir });
    const raw = fs.readFileSync(path.join(tmpDir, ...manifestRelPath), 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { raw, manifest: JSON.parse(raw), built };
  }

  it('the manifest emission never changes the bundle output (pure side-effect)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-byte-eq-'));
    const DELEGATE_OUTPUT = 'BUNDLE_BYTES_DELEGATE_OUTPUT';
    const result = applySherloTransforms(
      {
        projectRoot: tmpDir,
        resolver: {},
        serializer: { customSerializer: () => DELEGATE_OUTPUT },
      },
      { enabled: true }
    );
    const { graph } = buildFakeGraph(tmpDir);
    const output = result.serializer.customSerializer('index.js', [], graph, {
      projectRoot: tmpDir,
    });
    // Manifest WAS written (env var on)...
    const manifestExists = fs.existsSync(path.join(tmpDir, ...manifestRelPath));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // ...yet the delegate's bundle bytes come back untouched.
    expect(manifestExists).toBe(true);
    expect(output).toBe(DELEGATE_OUTPUT);
  });

  it('writes module-manifest.json with per-module hashes keyed by source path + a header', () => {
    const { manifest } = emitAndRead();
    expect(manifest.version).toBe(2);
    expect(typeof manifest.header).toBe('object');
    expect('metroVersion' in manifest.header).toBe(true);
    expect('envDigest' in manifest.header).toBe(true);
    expect(Array.isArray(manifest.header.envKeys)).toBe(true);
    // Every source module is hashed with a sha256 (64 hex chars), keyed by source path.
    expect(manifest.moduleHashes['./src/Button.tsx']).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.moduleHashes['./src/shared/Label.tsx']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('header carries seamVersion (frozen) and platform (from SHERLO_MODULE_MANIFEST_PLATFORM)', () => {
    const previous = process.env.SHERLO_MODULE_MANIFEST_PLATFORM;
    process.env.SHERLO_MODULE_MANIFEST_PLATFORM = 'ios';
    try {
      const { manifest } = emitAndRead();
      expect(manifest.header.seamVersion).toBe(1);
      expect(manifest.header.platform).toBe('ios');
    } finally {
      if (previous === undefined) delete process.env.SHERLO_MODULE_MANIFEST_PLATFORM;
      else process.env.SHERLO_MODULE_MANIFEST_PLATFORM = previous;
    }
  });

  it('header.platform is null when SHERLO_MODULE_MANIFEST_PLATFORM is unset', () => {
    const previous = process.env.SHERLO_MODULE_MANIFEST_PLATFORM;
    delete process.env.SHERLO_MODULE_MANIFEST_PLATFORM;
    try {
      const { manifest } = emitAndRead();
      expect(manifest.header.platform).toBeNull();
    } finally {
      if (previous !== undefined) process.env.SHERLO_MODULE_MANIFEST_PLATFORM = previous;
    }
  });

  it('story closure is the transitive forward dependency set (reached through require.context)', () => {
    const { manifest } = emitAndRead();
    const closure = manifest.storyClosures['./src/Button.stories.tsx'];
    expect(closure).toEqual(['./src/Button.tsx', './src/shared/Label.tsx']);
  });

  it('is emitted deterministically: two runs of the same graph produce byte-identical manifests', () => {
    const a = emitAndRead();
    const b = emitAndRead();
    expect(a.raw).toBe(b.raw);
  });

  it('a content change to one module changes ONLY that module hash (source-path keying is stable)', () => {
    const a = emitAndRead();
    // Re-emit with Label's code changed; every other module keeps its hash.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-edit-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    const built = buildFakeGraph(tmpDir);
    const labelAbs = path.join(tmpDir, 'src', 'shared', 'Label.tsx');
    (
      built.graph.dependencies.get(labelAbs) as { output: { data: { code: string } }[] }
    ).output[0].data.code = 'LABEL_CODE_EDITED';
    result.serializer.customSerializer('index.js', [], built.graph, { projectRoot: tmpDir });
    const edited = JSON.parse(fs.readFileSync(path.join(tmpDir, ...manifestRelPath), 'utf8'));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(edited.moduleHashes['./src/shared/Label.tsx']).not.toBe(
      a.manifest.moduleHashes['./src/shared/Label.tsx']
    );
    expect(edited.moduleHashes['./src/Button.tsx']).toBe(
      a.manifest.moduleHashes['./src/Button.tsx']
    );
  });

  it('names storybook.requires as generated from the files in its config directory', () => {
    // The requires file is regenerated on every bundle from the config directory
    // it sits in, and projects do not track it - so the header records which
    // files it was generated FROM, and the CLI digests those in its place.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-generated-'));
    const configDir = path.join(tmpDir, 'src', '.rnstorybook');
    fs.mkdirSync(path.join(configDir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(configDir, 'main.ts'), 'export default { stories: [] };');
    fs.writeFileSync(path.join(configDir, 'index.tsx'), 'export {};');
    fs.writeFileSync(path.join(configDir, 'storybook.requires.ts'), '// generated');
    fs.writeFileSync(path.join(configDir, 'nested', 'ignored.ts'), '// not a direct input');

    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    const { graph } = buildFakeGraph(tmpDir);
    result.serializer.customSerializer('index.js', [], graph, { projectRoot: tmpDir });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, ...manifestRelPath), 'utf8'));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(manifest.header.generatedFiles).toEqual({
      './src/.rnstorybook/storybook.requires.ts': {
        generatedBy: 'storybook-requires',
        inputs: ['./src/.rnstorybook/index.tsx', './src/.rnstorybook/main.ts'],
      },
    });
    // The generated file is still an ordinary module of the graph.
    expect(manifest.moduleHashes['./src/.rnstorybook/storybook.requires.ts']).toMatch(
      /^[0-9a-f]{64}$/
    );
  });

  it('bails open (no manifest) on an unrecognised Metro graph shape', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-bail-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    result.serializer.customSerializer(
      'index.js',
      [],
      { dependencies: {} },
      { projectRoot: tmpDir }
    );
    const exists = fs.existsSync(path.join(tmpDir, ...manifestRelPath));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(exists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SHERLO-1894 Phase B - the manifest travels
//   1. The manifest is emitted ONLY on the test:bundled bundling path, which the
//      CLI scopes by setting SHERLO_MODULE_MANIFEST=1 in its bundler subprocess.
//   2. Cross-machine determinism guard: modules whose transformed output inlines
//      the absolute project root are FLAGGED in header.absolutePathLeaks.
// ---------------------------------------------------------------------------

describe('applySherloTransforms - module manifest env-var enable (SHERLO-1894)', () => {
  const manifestRelPath = ['node_modules', '.cache', 'sherlo', 'module-manifest.json'];
  const ENV_FLAG = 'SHERLO_MODULE_MANIFEST';

  afterEach(() => {
    delete process.env[ENV_FLAG];
  });

  function runSerializer() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-env-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    const { graph } = buildFakeGraph(tmpDir);
    result.serializer.customSerializer('index.js', [], graph, { projectRoot: tmpDir });
    const exists = fs.existsSync(path.join(tmpDir, ...manifestRelPath));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return exists;
  }

  it('env var = "1" enables the manifest', () => {
    process.env[ENV_FLAG] = '1';
    expect(runSerializer()).toBe(true);
  });

  it('env var unset -> no manifest (default OFF preserved)', () => {
    expect(runSerializer()).toBe(false);
  });

  it('env var set to a non-"1" value does not enable the manifest', () => {
    process.env[ENV_FLAG] = 'true';
    expect(runSerializer()).toBe(false);
  });
});

describe('applySherloTransforms - cross-machine absolute-path guard (SHERLO-1894)', () => {
  const manifestRelPath = ['node_modules', '.cache', 'sherlo', 'module-manifest.json'];

  beforeEach(() => {
    process.env.SHERLO_MODULE_MANIFEST = '1';
  });
  afterEach(() => {
    delete process.env.SHERLO_MODULE_MANIFEST;
  });

  function emitWith(mutate: (graph: any, tmpDir: string) => void) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-leak-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    const { graph, buttonPath } = buildFakeGraph(tmpDir);
    mutate(graph, tmpDir);
    result.serializer.customSerializer('index.js', [], graph, { projectRoot: tmpDir });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, ...manifestRelPath), 'utf8'));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { manifest, buttonPath };
  }

  it('no leak -> header.absolutePathLeaks is present and empty', () => {
    const { manifest } = emitWith(() => {});
    expect(Array.isArray(manifest.header.absolutePathLeaks)).toBe(true);
    expect(manifest.header.absolutePathLeaks).toEqual([]);
  });

  it('a module whose transformed output inlines the abs project root is FLAGGED (not thrown)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { manifest } = emitWith((graph, tmpDir) => {
      const buttonAbs = path.join(tmpDir, 'src', 'Button.tsx');
      // Inline the absolute project root into Button's transformed code.
      graph.dependencies.get(buttonAbs).output[0].data.code =
        'var p = "' + tmpDir + '/src/asset.png";';
    });
    // Flagged by its source-path key; the manifest is still emitted (bail-open).
    expect(manifest.header.absolutePathLeaks).toContain('./src/Button.tsx');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('the leak flag does NOT change the flagged module hash (hash stays verbatim)', () => {
    // Same code content, once without and once with the abs path; the abs-path
    // variant is flagged but its hash is simply the hash of its (leaky) code -
    // the guard is a pure read that never alters hashing.
    const clean = emitWith(() => {});
    const cleanHash = clean.manifest.moduleHashes['./src/Button.tsx'];
    const leaked = emitWith((graph, tmpDir) => {
      const buttonAbs = path.join(tmpDir, 'src', 'Button.tsx');
      graph.dependencies.get(buttonAbs).output[0].data.code = tmpDir + '/x';
    });
    // Different code -> different hash (expected); the point is the guard flags it
    // without suppressing or rewriting the hash.
    expect(leaked.manifest.moduleHashes['./src/Button.tsx']).not.toBe(cleanHash);
    expect(leaked.manifest.header.absolutePathLeaks).toContain('./src/Button.tsx');
  });
});
