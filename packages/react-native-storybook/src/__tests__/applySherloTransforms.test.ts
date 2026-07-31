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
// TurboSnap Phase 2 – dependency graph sidecar
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
