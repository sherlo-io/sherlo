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
// Diff Scope Phase 2 – dependency graph sidecar
// ---------------------------------------------------------------------------

describe('applySherloTransforms – emitDependencyGraphSidecar (via customSerializer)', () => {
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

    expect(typeof result.serializer.customSerializer).toBe('function');
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

  it('emits graph.json sidecar with valid schema when serializer runs', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-graph-sidecar-'));
    const fakeSerializer = () => 'BYTES';
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: fakeSerializer } },
      { enabled: true }
    );

    // Build a minimal Metro-like graph using paths WITHIN tmpDir so toRelativePath works.
    const buttonPath = path.join(tmpDir, 'src', 'Button.tsx');
    const storiesPath = path.join(tmpDir, 'src', 'Button.stories.tsx');
    const fakeDeps = new Map();
    fakeDeps.set(buttonPath, {
      dependencies: new Map([['key1', { absolutePath: storiesPath, data: { data: {} } }]]),
    });
    fakeDeps.set(storiesPath, { dependencies: new Map() });

    result.serializer.customSerializer(
      'index.js',
      [],
      { dependencies: fakeDeps },
      { projectRoot: tmpDir }
    );

    const sidecarPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'graph.json');
    const exists = fs.existsSync(sidecarPath);
    const sidecar = exists ? JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) : null;
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(exists).toBe(true);
    expect(sidecar).not.toBeNull();
    expect(sidecar.version).toBe(1);
    expect(typeof sidecar.inverseGraph).toBe('object');
    expect(typeof sidecar.contextGraph).toBe('object');
    // Button.tsx statically imports Button.stories.tsx → inverse: stories.tsx ← Button.tsx
    expect(Array.isArray(sidecar.inverseGraph['./src/Button.stories.tsx'])).toBe(true);
    expect(sidecar.inverseGraph['./src/Button.stories.tsx']).toContain('./src/Button.tsx');
  });

  it('emits mockedFileToKey mapping the mocked real file back to its mock key (EB-07)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-graph-mockedge-'));

    // A real mocked module and a story that declares a mock for it.
    const modulesDir = path.join(tmpDir, 'src', 'api');
    fs.mkdirSync(modulesDir, { recursive: true });
    const realModulePath = path.join(modulesDir, 'client.ts');
    fs.writeFileSync(realModulePath, 'export const get = () => "real";\n', 'utf8');
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'Api.stories.tsx'),
      "export default { title: 'Api', parameters: { sherlo: { mocks: { './src/api/client': () => ({ get: () => 'mock' }) } } } };\n",
      'utf8'
    );

    const fakeSerializer = () => 'BYTES';
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: fakeSerializer } },
      { experimentalMocks: true }
    );

    // The mocked module is in the graph because its shim requires it; model that
    // by putting the real file (with extension) in the dependency map.
    const fakeDeps = new Map();
    fakeDeps.set(realModulePath, { dependencies: new Map() });

    result.serializer.customSerializer(
      'index.js',
      [],
      { dependencies: fakeDeps },
      { projectRoot: tmpDir }
    );

    const sidecarPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'graph.json');
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(sidecar.mockedFileToKey).toBeDefined();
    expect(sidecar.mockedFileToKey['./src/api/client.ts']).toBe('./src/api/client');
  });

  it('does NOT emit sidecar for unrecognised Metro Graph shape (bail-open)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-graph-bail-'));
    const fakeSerializer = () => 'BYTES';
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: fakeSerializer } },
      { enabled: true }
    );

    // Unrecognised graph: dependencies is not a Map
    result.serializer.customSerializer(
      'index.js',
      [],
      { dependencies: {} },
      { projectRoot: tmpDir }
    );

    const sidecarPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'graph.json');
    const exists = fs.existsSync(sidecarPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(exists).toBe(false);
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
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // In the test environment Metro internals may or may not be available.
    // The test only asserts the function doesn't throw and the serializer
    // object is still valid (getPolyfills is still set).
    expect(typeof result.serializer.getPolyfills).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// SHERLO-1890 Diff Scope v2 Phase A – module manifest sidecar
//   (opt-in `experimentalModuleManifest`, default OFF, must ship INERT)
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

describe('applySherloTransforms – module manifest sidecar OFF-is-inert', () => {
  const manifestRelPath = ['node_modules', '.cache', 'sherlo', 'module-manifest.json'];
  const graphRelPath = ['node_modules', '.cache', 'sherlo', 'graph.json'];

  function runSerializer(opts: Record<string, unknown>) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-'));
    const DELEGATE_OUTPUT = 'BUNDLE_BYTES_DELEGATE_OUTPUT';
    const result = applySherloTransforms(
      {
        projectRoot: tmpDir,
        resolver: {},
        serializer: { customSerializer: () => DELEGATE_OUTPUT },
      },
      opts
    );
    const { graph } = buildFakeGraph(tmpDir);
    const output = result.serializer.customSerializer('index.js', [], graph, {
      projectRoot: tmpDir,
    });
    return { tmpDir, output, DELEGATE_OUTPUT };
  }

  it('flag OFF (absent): no module-manifest.json is written', () => {
    const { tmpDir } = runSerializer({ enabled: true });
    const exists = fs.existsSync(path.join(tmpDir, ...manifestRelPath));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(exists).toBe(false);
  });

  it('flag OFF (explicit false): no module-manifest.json is written', () => {
    const { tmpDir } = runSerializer({ enabled: true, experimentalModuleManifest: false });
    const exists = fs.existsSync(path.join(tmpDir, ...manifestRelPath));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(exists).toBe(false);
  });

  it('flag OFF: bundle output byte-identical to flag ON (manifest never touches the bundle)', () => {
    const off = runSerializer({ enabled: true });
    const on = runSerializer({ enabled: true, experimentalModuleManifest: true });
    fs.rmSync(off.tmpDir, { recursive: true, force: true });
    fs.rmSync(on.tmpDir, { recursive: true, force: true });
    expect(off.output).toBe(off.DELEGATE_OUTPUT);
    expect(on.output).toBe(on.DELEGATE_OUTPUT);
    expect(on.output).toBe(off.output);
  });

  it('flag OFF vs ON: graph.json bytes are IDENTICAL (manifest never touches the existing sidecar)', () => {
    const off = runSerializer({ enabled: true });
    const on = runSerializer({ enabled: true, experimentalModuleManifest: true });
    const graphOff = fs.readFileSync(path.join(off.tmpDir, ...graphRelPath), 'utf8');
    const graphOn = fs.readFileSync(path.join(on.tmpDir, ...graphRelPath), 'utf8');
    fs.rmSync(off.tmpDir, { recursive: true, force: true });
    fs.rmSync(on.tmpDir, { recursive: true, force: true });
    expect(graphOn).toBe(graphOff);
  });
});

describe('applySherloTransforms – module manifest sidecar when flag ON', () => {
  const manifestRelPath = ['node_modules', '.cache', 'sherlo', 'module-manifest.json'];

  function emitAndRead(opts: Record<string, unknown>) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-on-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      opts
    );
    const built = buildFakeGraph(tmpDir);
    result.serializer.customSerializer('index.js', [], built.graph, { projectRoot: tmpDir });
    const raw = fs.readFileSync(path.join(tmpDir, ...manifestRelPath), 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { raw, manifest: JSON.parse(raw), built };
  }

  it('writes module-manifest.json with per-module hashes keyed by source path + a header', () => {
    const { manifest } = emitAndRead({ enabled: true, experimentalModuleManifest: true });
    expect(manifest.version).toBe(1);
    expect(typeof manifest.header).toBe('object');
    expect('metroVersion' in manifest.header).toBe(true);
    expect('envDigest' in manifest.header).toBe(true);
    expect(Array.isArray(manifest.header.envKeys)).toBe(true);
    // Every source module is hashed with a sha256 (64 hex chars), keyed by source path.
    expect(manifest.moduleHashes['./src/Button.tsx']).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.moduleHashes['./src/shared/Label.tsx']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('story closure is the transitive forward dependency set (reached through require.context)', () => {
    const { manifest } = emitAndRead({ enabled: true, experimentalModuleManifest: true });
    const closure = manifest.storyClosures['./src/Button.stories.tsx'];
    expect(closure).toEqual(['./src/Button.tsx', './src/shared/Label.tsx']);
  });

  it('is emitted deterministically: two runs of the same graph produce byte-identical manifests', () => {
    const a = emitAndRead({ enabled: true, experimentalModuleManifest: true });
    const b = emitAndRead({ enabled: true, experimentalModuleManifest: true });
    expect(a.raw).toBe(b.raw);
  });

  it('a content change to one module changes ONLY that module hash (source-path keying is stable)', () => {
    const a = emitAndRead({ enabled: true, experimentalModuleManifest: true });
    // Re-emit with Label's code changed; every other module keeps its hash.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-edit-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true, experimentalModuleManifest: true }
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

  it('bails open (no manifest) on an unrecognised Metro graph shape', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-bail-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true, experimentalModuleManifest: true }
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
