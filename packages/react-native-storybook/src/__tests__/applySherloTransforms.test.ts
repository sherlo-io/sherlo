'use strict';

import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { readStorybookFacts, recordWhatStartWasHanded } from '../getStorybook/storybookFacts';
import {
  keepStartedStorybook,
  readStorybookChannel,
  readStorybooksCurrentStory,
} from '../getStorybook/storybookReads';
import { loadStartWrapper, storyFolder } from './sherlosStartWrapper';

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

    // A bare React Native config (@react-native/metro-config) names no serializer of its own,
    // where Expo's does, so the wrapper hands the bundle to Metro's own serializer. Metro 0.83
    // and later let a package reach its files only under metro/private/, and this repository
    // installs such a Metro.
    it('a bare React Native bundle writes the module map, as an Expo one does', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-graph-bare-'));
      const result = applySherloTransforms(
        { projectRoot: tmpDir, resolver: {} },
        { enabled: true }
      );

      const bundle = result.serializer.customSerializer?.(
        'index.js',
        [],
        { dependencies: new Map() },
        { projectRoot: tmpDir, createModuleId: () => 0, processModuleFilter: () => true }
      );
      const mapWritten = fs.existsSync(
        path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'module-manifest.json')
      );
      fs.rmSync(tmpDir, { recursive: true, force: true });

      expect(typeof bundle).toBe('string');
      expect(mapWritten).toBe(true);
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

// Extends buildFakeGraph's graph with an app-owned require.context, modeled on
// the Diff Scope fixture app's StorefrontBadge component
// (apps/integrated-app-expo/.../StorefrontBadge.tsx), which gathers its own
// icons with `require.context('./badgeIcons', false, /\.ts$/)`:
//   StorefrontBadge.tsx --require.context--> (synthetic ctx) --> [truck.ts, cart.ts]
// Neither icon is a story, and this edge is declared by an ordinary app module,
// not by storybook.requires.ts.
function addAppOwnedContext(root: string, graph: ReturnType<typeof buildFakeGraph>['graph']) {
  const badgePath = path.join(root, 'src', 'StorefrontBadge.tsx');
  const badgeCtxPath = path.join(root, 'src', 'StorefrontBadge.tsx?ctx');
  const truckPath = path.join(root, 'src', 'badgeIcons', 'truck.ts');
  const cartPath = path.join(root, 'src', 'badgeIcons', 'cart.ts');

  const mod = (code: string, deps: Map<string, unknown>) => ({
    output: [{ data: { code } }],
    dependencies: deps,
  });

  graph.dependencies.set(
    badgePath,
    mod(
      'BADGE_CODE',
      new Map([['ctx', { absolutePath: badgeCtxPath, data: { data: { contextParams: {} } } }]])
    )
  );
  graph.dependencies.set(
    badgeCtxPath,
    mod(
      'CTX_CODE',
      new Map([
        ['truck', { absolutePath: truckPath, data: { data: {} } }],
        ['cart', { absolutePath: cartPath, data: { data: {} } }],
      ])
    )
  );
  graph.dependencies.set(truckPath, mod('TRUCK_CODE', new Map()));
  graph.dependencies.set(cartPath, mod('CART_CODE', new Map()));
}

// Extends buildFakeGraph's graph with a preview module, modeled on
// storybook.requires.ts's own generated `annotations` array:
//   `const annotations = [require('./preview'), require('@storybook/react-native/preview')];`
// This is an ORDINARY edge from the requires file (no contextParams) - unlike
// the require.context edge collectStories matches, so preview.ts is
// never mistaken for a story. Storybook applies preview's decorators around
// every story it renders, so preview.ts sits ABOVE every story - no story
// ever imports it, and a downward walk from a story can never reach it.
function addPreviewImport(root: string, graph: ReturnType<typeof buildFakeGraph>['graph']) {
  const requiresPath = path.join(root, 'src', '.rnstorybook', 'storybook.requires.ts');
  const previewPath = path.join(root, 'src', '.rnstorybook', 'preview.ts');
  const themePath = path.join(root, 'src', 'shared', 'theme.ts');

  const mod = (code: string, deps: Map<string, unknown>) => ({
    output: [{ data: { code } }],
    dependencies: deps,
  });

  // preview.ts imports theme.ts.
  graph.dependencies.set(
    previewPath,
    mod('PREVIEW_CODE', new Map([['t', { absolutePath: themePath, data: { data: {} } }]]))
  );
  graph.dependencies.set(themePath, mod('THEME_CODE', new Map()));

  // storybook.requires.ts requires preview.ts as an ordinary (non-context) edge.
  const requiresModule = graph.dependencies.get(requiresPath) as {
    dependencies: Map<string, unknown>;
  };
  requiresModule.dependencies.set('preview', { absolutePath: previewPath, data: { data: {} } });

  return { previewPath, themePath };
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
    const { manifest } = emitAndRead();
    const closure = manifest.storyClosures['./src/Button.stories.tsx'];
    expect(closure).toEqual(['./src/Button.tsx', './src/shared/Label.tsx']);
  });

  it("a file the preview imports is in every story's closure", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-preview-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    const built = buildFakeGraph(tmpDir);
    addPreviewImport(tmpDir, built.graph);
    result.serializer.customSerializer('index.js', [], built.graph, { projectRoot: tmpDir });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, ...manifestRelPath), 'utf8'));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // preview.ts is applied around every story by Storybook, not imported BY any
    // story - a downward walk from Button.stories.tsx alone would never reach it.
    // Both preview.ts itself and the file it imports must still land in the
    // story's closure, or an edit to either is reported as "nothing changed".
    const closure = manifest.storyClosures['./src/Button.stories.tsx'];
    expect(closure).toContain('./src/.rnstorybook/preview.ts');
    expect(closure).toContain('./src/shared/theme.ts');
  });

  it('CONTROL: a file no story and no preview reaches is in no closure', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-control-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    const built = buildFakeGraph(tmpDir);
    addPreviewImport(tmpDir, built.graph);
    const orphanPath = path.join(tmpDir, 'src', 'shared', 'Orphan.ts');
    built.graph.dependencies.set(orphanPath, {
      output: [{ data: { code: 'ORPHAN_CODE' } }],
      dependencies: new Map(),
    });
    result.serializer.customSerializer('index.js', [], built.graph, { projectRoot: tmpDir });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, ...manifestRelPath), 'utf8'));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // Orphan.ts is hashed (it's in the graph)...
    expect(manifest.moduleHashes['./src/shared/Orphan.ts']).toMatch(/^[0-9a-f]{64}$/);
    // ...but reached by neither a story nor the preview, so the fix must not have
    // made every module reach every closure - the feature must stay discriminating.
    Object.values(manifest.storyClosures as Record<string, string[]>).forEach((closure) => {
      expect(closure).not.toContain('./src/shared/Orphan.ts');
    });
  });

  it('a require.context written by the app is not a story source', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-app-ctx-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    const built = buildFakeGraph(tmpDir);
    addAppOwnedContext(tmpDir, built.graph);
    result.serializer.customSerializer('index.js', [], built.graph, { projectRoot: tmpDir });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, ...manifestRelPath), 'utf8'));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // truck.ts and cart.ts are gathered by the app's own require.context, not
    // storybook.requires.ts - neither is a story, so neither gets a closure.
    expect(Object.keys(manifest.storyClosures)).toEqual(['./src/Button.stories.tsx']);
  });

  it('the stories still come from storybook.requires when the app has a require.context of its own', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-app-ctx-plus-story-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    const built = buildFakeGraph(tmpDir);
    addAppOwnedContext(tmpDir, built.graph);
    result.serializer.customSerializer('index.js', [], built.graph, { projectRoot: tmpDir });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, ...manifestRelPath), 'utf8'));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // The real story, declared by storybook.requires.ts, is unaffected by the
    // app's own require.context living elsewhere in the graph.
    expect(manifest.storyClosures['./src/Button.stories.tsx']).toEqual([
      './src/Button.tsx',
      './src/shared/Label.tsx',
    ]);
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

// ---------------------------------------------------------------------------
// The header does not depend on where the project sits on disk
// ---------------------------------------------------------------------------
//
// Expo sets EXPO_PUBLIC_PROJECT_ROOT to the absolute project root inside the bundler process. The
// same project bundled from two different folders must produce the same header, or two builds of
// identical code are never comparable.

describe('applySherloTransforms - the header is the same wherever the project sits', () => {
  const manifestRelPath = ['node_modules', '.cache', 'sherlo', 'module-manifest.json'];

  beforeEach(() => {
    process.env.SHERLO_MODULE_MANIFEST = '1';
  });
  afterEach(() => {
    delete process.env.SHERLO_MODULE_MANIFEST;
    delete process.env.EXPO_PUBLIC_PROJECT_ROOT;
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  function headerFor(projectRoot: string) {
    const result = applySherloTransforms(
      { projectRoot, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    const { graph } = buildFakeGraph(projectRoot);
    result.serializer.customSerializer('index.js', [], graph, { projectRoot });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectRoot, ...manifestRelPath), 'utf8')
    );
    return manifest.header;
  }

  it('the same project in two folders produces the same module map header', () => {
    const folderA = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-header-folder-a-'));
    const folderB = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-header-folder-b-'));

    // Expo's CLI sets this to the absolute project root inside the bundler process -
    // the one thing that necessarily differs between the two folders.
    process.env.EXPO_PUBLIC_PROJECT_ROOT = folderA;
    const headerA = headerFor(folderA);
    process.env.EXPO_PUBLIC_PROJECT_ROOT = folderB;
    const headerB = headerFor(folderB);

    fs.rmSync(folderA, { recursive: true, force: true });
    fs.rmSync(folderB, { recursive: true, force: true });

    expect(headerA).toEqual(headerB);
  });

  it('an EXPO_PUBLIC_ value that differs for another reason still changes the header', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-header-real-var-'));

    process.env.EXPO_PUBLIC_API_URL = 'https://one.example.com';
    const headerOne = headerFor(tmpDir);
    process.env.EXPO_PUBLIC_API_URL = 'https://two.example.com';
    const headerTwo = headerFor(tmpDir);

    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(headerOne).not.toEqual(headerTwo);
  });
});

// ---------------------------------------------------------------------------
// Sherlo's address on the bundler
// ---------------------------------------------------------------------------
//
// The line itself is held by sherloLine.test.ts; this holds the one thing that puts it on a
// developer's bundler at all - the middleware Sherlo adds to the config it hands back. Without it
// there is no road, and every test either side of it still passes.

describe("applySherloTransforms - Sherlo's address on the bundler", () => {
  function enhancedMiddlewareFor(config: Record<string, unknown>) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-letterbox-address-'));
    const result = applySherloTransforms(
      { projectRoot: tmpDir, resolver: {}, ...config },
      { enabled: true }
    );
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return result.server.enhanceMiddleware;
  }

  /** A request/response pair with just the parts the letterbox reads and writes. */
  function requestFor(url: string, method: string) {
    const request = {
      url,
      method,
      on: (event: string, listener: (chunk?: unknown) => void) => {
        if (event === 'end') listener();
        return request;
      },
    };
    const written: string[] = [];
    const response = {
      written,
      on: () => response,
      writeHead: () => response,
      end: (body: string) => written.push(body),
    };
    return { request, response };
  }

  it("serves Sherlo's address, and hands everything else to the bundler", () => {
    const reachedTheBundler: string[] = [];
    const enhance = enhancedMiddlewareFor({});
    const middleware = enhance((request: any) => reachedTheBundler.push(request.url));

    // The plain request the command line sends before its WebSocket is answered by Sherlo.
    const line = requestFor('/sherlo/line', 'GET');
    middleware(line.request, line.response, () => {});
    expect(line.response.written).toEqual([JSON.stringify({ protocolVersion: 1 })]);
    expect(reachedTheBundler).toEqual([]);

    const bundle = requestFor('/index.bundle?platform=ios', 'GET');
    middleware(bundle.request, bundle.response, () => {});
    expect(bundle.response.written).toEqual([]);
    expect(reachedTheBundler).toEqual(['/index.bundle?platform=ios']);
  });

  it("keeps a project's own enhanceMiddleware in the chain", () => {
    const chain: string[] = [];
    const enhance = enhancedMiddlewareFor({
      server: {
        enhanceMiddleware: (metroMiddleware: any) => (request: any, response: any, next: any) => {
          chain.push('the project');
          return metroMiddleware(request, response, next);
        },
      },
    });
    const middleware = enhance((request: any) => chain.push(`the bundler: ${request.url}`));

    const bundle = requestFor('/index.bundle', 'GET');
    middleware(bundle.request, bundle.response, () => {});

    expect(chain).toEqual(['the project', 'the bundler: /index.bundle']);
  });

  it('serves none of the three addresses the line replaced: each reaches the bundler', () => {
    const reachedTheBundler: string[] = [];
    const enhance = enhancedMiddlewareFor({});
    const middleware = enhance((request: any) => reachedTheBundler.push(request.url));

    for (const replacedAddress of ['/sherlo/letterbox', '/sherlo/capture', '/sherlo/capture-log']) {
      const request = requestFor(replacedAddress, 'GET');
      middleware(request.request, request.response, () => {});
      expect(request.response.written).toEqual([]);
    }
    expect(reachedTheBundler).toEqual([
      '/sherlo/letterbox',
      '/sherlo/capture',
      '/sherlo/capture-log',
    ]);
  });

  it("takes the WebSocket upgrade for Sherlo's address and hands every other upgrade to the bundler's own sockets", async () => {
    const ws = require('ws');
    // A project folder inside this package, so the line finds Metro, and its `ws`, as it does in
    // a project: from the project's own folder.
    // The package's own `node_modules` is made first: a checkout whose install nests nothing there lacks it.
    const lineFolders = path.join(__dirname, '../../node_modules');
    fs.mkdirSync(lineFolders, { recursive: true });
    const projectRoot = fs.mkdtempSync(path.join(lineFolders, '.sherlo-line-'));
    const result = applySherloTransforms({ projectRoot, resolver: {} }, { enabled: true });

    // The bundler: a server whose own upgrade listener is in place before any request, as Metro's
    // is, and whose middleware is Sherlo's in front of the bundle.
    const upgradesTheBundlerTook: string[] = [];
    const bundlerServer = http.createServer(
      result.server.enhanceMiddleware((request: any, response: any) => response.end('the bundle'))
    );
    bundlerServer.on('upgrade', (request: any, socket: any) => {
      upgradesTheBundlerTook.push(request.url);
      socket.destroy();
    });
    await new Promise<void>((resolve) => bundlerServer.listen(0, '127.0.0.1', resolve));
    const origin = `127.0.0.1:${(bundlerServer.address() as any).port}`;

    try {
      // One plain request first: it mounts the line, and is answered by Sherlo.
      const plainAnswer = await fetch(`http://${origin}/sherlo/line`);
      expect(await plainAnswer.json()).toEqual({ protocolVersion: 1 });

      // Sherlo's address is the line: a driver's question there is answered.
      const driver = new ws(`ws://${origin}/sherlo/line`);
      await new Promise((resolve) => driver.once('open', resolve));
      const reply = new Promise((resolve) =>
        driver.once('message', (data: unknown) => resolve(JSON.parse(String(data))))
      );
      driver.send(JSON.stringify({ action: 'whatIsOnScreen', askId: '1' }));
      expect(await reply).toEqual({ action: 'reply', askId: '1', reply: { kind: 'no-app' } });
      driver.terminate();

      // Every other upgrade goes to the bundler's own listener, untouched.
      const hotReload = new ws(`ws://${origin}/hot`);
      await new Promise((resolve) => hotReload.once('close', resolve).once('error', resolve));
      expect(upgradesTheBundlerTook).toEqual(['/hot']);

      // And every other request is still the bundler's.
      expect(await (await fetch(`http://${origin}/index.bundle`)).text()).toBe('the bundle');
    } finally {
      bundlerServer.close();
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

/**
 * THE SWAP THE WHOLE SDK RESTS ON, and until now nothing held it.
 *
 * Sherlo reaches inside Storybook by answering every request for the Storybook package with a
 * generated file, which hands back the real Storybook with its opening function replaced. Every
 * other thing the SDK does to Storybook - which story opens first, whether the last one is
 * remembered, whether it talks to a server - is downstream of that one move, and there were tests
 * either side of it and none on it.
 *
 * The wrapper is loaded here the way the bundle loads it - as its own source, with a `require` that
 * answers for the two packages it reaches for - because what the swap does is decided by the bytes
 * that are written, not by the function that wrote them.
 */
describe('the swap', () => {
  it('the Storybook package resolves to the generated wrapper, and the wrapper hands back Storybook with the opening function swapped', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-the-swap-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: true });

    // 1. Every request for the Storybook package resolves to Sherlo's generated wrapper.
    const resolved = result.resolver.resolveRequest(
      {
        originModulePath: path.join(tmpDir, 'src', '.rnstorybook', 'index.tsx'),
        resolveRequest: () => ({ type: 'sourceFile', filePath: '/the/real/storybook' }),
      },
      '@storybook/react-native',
      'ios'
    );
    const wrapperPath = path.join(
      tmpDir,
      'node_modules',
      '.cache',
      'sherlo',
      'storybook-wrapper.js'
    );
    expect(resolved).toEqual({ type: 'sourceFile', filePath: wrapperPath });

    // 2. That wrapper hands back the real Storybook...
    const wrapper = loadWrapper(fs.readFileSync(wrapperPath, 'utf8'));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(wrapper.exports.addons).toBe(realStorybook.addons);

    // ...with its opening function swapped: the view Storybook returns is the same view, and the
    // one thing on it that opens a story screen now runs through Sherlo.
    expect(wrapper.exports.start).not.toBe(realStorybook.start);

    const view = wrapper.exports.start({ storybook: 'config' });
    expect(view).toBe(realStorybookView);
    // Storybook is started with what it was handed, and Sherlo's own annotation after it.
    expect(realStorybook.startedWith).toEqual({
      storybook: 'config',
      annotations: [sherlosAnnotation],
    });

    const params = { theme: 'dark' };
    view.getStorybookUI(params);
    expect(sherloGetStorybookCalls).toEqual([[realStorybookView, params]]);
  });

  it("the start wrapper keeps the story entries and annotations Storybook was handed, and adds Sherlo's annotation last", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-start-wrapper-'));
    // The project's own Storybook, whose version the wrapper is written with.
    const storybookPackage = path.join(tmpDir, 'node_modules', '@storybook', 'react-native');
    fs.mkdirSync(path.join(storybookPackage, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(storybookPackage, 'package.json'),
      JSON.stringify({
        name: '@storybook/react-native',
        version: '9.1.4',
        exports: { '.': './dist/index.js' },
      })
    );
    fs.writeFileSync(path.join(storybookPackage, 'dist', 'index.js'), '');
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: true });
    const wrapperSource = fs.readFileSync(
      path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js'),
      'utf8'
    );
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const wrapper = loadWrapper(wrapperSource);

    // What Storybook's generated requires file hands start(): its story folders, and the
    // project's preview first among the annotations, an addon's after it.
    const storyFile = {
      default: { title: 'Components/Button' },
      Primary: { parameters: { sherlo: { mocks: { 'pkg/a': { value: 'a' } } } } },
    };
    const req = Object.assign((_filename: string) => storyFile, {
      keys: () => ['./Button.stories.tsx'],
    });
    const storyEntries = [{ directory: './src', req }];
    const projectsPreview = { default: { parameters: { sherlo: { mocks: {} } } } };
    const addonsPreview = { decorators: [] };

    const view = wrapper.exports.start({
      storyEntries,
      annotations: [projectsPreview, addonsPreview],
    });

    // Storybook gets the same story entries, and the same annotations in the same order, with
    // Sherlo's annotation last.
    expect(realStorybook.startedWith.storyEntries).toBe(storyEntries);
    expect(realStorybook.startedWith.annotations).toEqual([
      projectsPreview,
      addonsPreview,
      sherlosAnnotation,
    ]);
    expect(realStorybook.startedWith.annotations[0]).toBe(projectsPreview);

    // The SDK keeps them as plain facts: the index Storybook's own prepareStories builds, every
    // story file by the import path the index names, and each preview's annotations.
    expect(readStorybookFacts()).toEqual({
      storyIndex: realStorybook.prepareStories({ storyEntries }).index.entries,
      storyFiles: { './src/Button.stories.tsx': storyFile },
      previewAnnotations: [projectsPreview.default, addonsPreview],
    });

    // ...and the view Storybook returned, for the few reads that have no public way, whose errors
    // name the version the bundle was built with.
    expect(readStorybookChannel().value).toBe(view._channel);
    expect(readStorybooksCurrentStory({}).error).toContain('@storybook/react-native 9.1.4');
  });

  it("a hot update keeps Sherlo's annotation last and records the new stories", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-hot-update-'));
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: true });
    const wrapperSource = fs.readFileSync(
      path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js'),
      'utf8'
    );
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const wrapper = loadWrapper(wrapperSource);

    const buttonFile = { default: { title: 'Components/Button' }, Primary: {} };
    const view = wrapper.exports.start({
      storyEntries: [storyFolder('./src', { './Button.stories.tsx': buttonFile })],
      annotations: [{ parameters: {} }],
    });

    // A developer edits a story file and adds another: the generated requires file runs again and,
    // Storybook having started, hands updateView the view and everything afresh.
    const cardFile = {
      default: { title: 'Components/Card' },
      Tall: { parameters: { sherlo: { mocks: { 'pkg/a': { value: 'tall' } } } } },
    };
    const updatedEntries = [
      storyFolder('./src', { './Button.stories.tsx': buttonFile, './Card.stories.tsx': cardFile }),
    ];
    const projectsPreview = { default: { parameters: { sherlo: { mocks: {} } } } };
    const options = { playFn: false };
    wrapper.exports.updateView(view, [projectsPreview], updatedEntries, options);

    // Storybook updates the same view with the same stories and options, and with Sherlo's
    // annotation still last among the annotations, which it would otherwise replace without it.
    expect(realStorybook.updatedWith).toEqual([
      view,
      [projectsPreview, sherlosAnnotation],
      updatedEntries,
      options,
    ]);
    expect(realStorybook.updatedWith[2]).toBe(updatedEntries);

    // The SDK's facts are the new ones: the new story is in the index, its file among the files.
    expect(readStorybookFacts()).toEqual({
      storyIndex: realStorybook.prepareStories({ storyEntries: updatedEntries }).index.entries,
      storyFiles: {
        './src/Button.stories.tsx': buttonFile,
        './src/Card.stories.tsx': cardFile,
      },
      previewAnnotations: [projectsPreview.default],
    });
    expect(readStorybookFacts()?.storyIndex['components-card--tall']).toBeDefined();
  });
});

/* ========================================================================== */

const realStorybookView: any = {
  _channel: { on: () => {}, off: () => {}, emit: () => {} },
  getStorybookUI: () => () => null,
};

const realStorybook: any = {
  addons: { some: 'addon' },
  startedWith: undefined,
  start: (config: unknown) => {
    realStorybook.startedWith = config;
    return realStorybookView;
  },
  updatedWith: undefined,
  // What the generated requires file calls on a hot update, instead of start().
  updateView: (...args: unknown[]) => {
    realStorybook.updatedWith = args;
  },
  // Storybook's exported prepareStories, as much of it as indexes the story files it is handed:
  // one entry per export of each file but its default, which names the title.
  prepareStories: ({ storyEntries }: { storyEntries?: FakeStoryEntry[] }) => {
    const entries: Record<string, unknown> = {};
    for (const { directory, req } of storyEntries ?? []) {
      for (const filename of req.keys()) {
        const { default: meta, ...stories } = req(filename);
        for (const name of Object.keys(stories)) {
          const id = `${meta.title.toLowerCase().replace('/', '-')}--${name.toLowerCase()}`;
          const importPath = `${directory}/${filename.substring(2)}`;
          entries[id] = { id, title: meta.title, name, importPath };
        }
      }
    }
    return { index: { entries } };
  },
};

type FakeStoryEntry = {
  directory: string;
  req: { keys(): string[]; (filename: string): { default: { title: string } } };
};

/** Sherlo's annotation, as the wrapper takes it from the SDK. */
const sherlosAnnotation = { decorators: [], loaders: [] };

const sherloGetStorybookCalls: unknown[][] = [];

/**
 * Run the generated wrapper's own source as the bundle would, answering the two packages it
 * requires: the real Storybook, and Sherlo's own story screen.
 */
function loadWrapper(source: string): { exports: any } {
  return loadStartWrapper(source, {
    '@storybook/react-native': realStorybook,
    '@sherlo/react-native-storybook/dist/getStorybook/index.js': {
      default: (...args: unknown[]) => {
        sherloGetStorybookCalls.push(args);
        return () => null;
      },
      sherloAnnotation: sherlosAnnotation,
      // The SDK's own, which keep what the wrapper hands them.
      recordWhatStartWasHanded,
      keepStartedStorybook,
    },
    '@sherlo/react-native-storybook/dist/addStorybookToDevMenu.js': { default: () => {} },
  });
}
