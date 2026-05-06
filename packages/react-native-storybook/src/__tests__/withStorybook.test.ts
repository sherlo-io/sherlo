'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// applySherloTransforms is the core logic extracted from the old createSherloStorybook factory.
// We test it directly so we don't need to mock @storybook/react-native peer dep.
const applySherloTransforms = require('../../metro/applySherloTransforms');

const POLYFILL_PATH = path.resolve(__dirname, '../../metro/polyfill.js');

// Helper: run applySherloTransforms with a temp projectRoot, clean up, return result.
function runTransform(sherloOpts?: Record<string, unknown>, configOverride?: any): any {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-transform-test-'));
  const baseConfig = configOverride ?? { projectRoot: tmpDir, resolver: {} };
  const result = applySherloTransforms(baseConfig, sherloOpts);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

// Helper: generate wrapper content on disk and return its text.
function readGeneratedWrapper(configPath?: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-wrapper-test-'));
  const baseConfig = { projectRoot: tmpDir, resolver: {} };
  applySherloTransforms(baseConfig, configPath !== undefined ? { configPath } : undefined);
  const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
  const content = fs.readFileSync(wrapperPath, 'utf8');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return content;
}

// ---------------------------------------------------------------------------
// withStorybook.js - file structure (not loaded to avoid peer dep resolution)
// ---------------------------------------------------------------------------

describe('withStorybook.js - file structure', () => {
  it('withStorybook.js file exists at package root', () => {
    const withStorybookPath = require.resolve('../../withStorybook.js');
    expect(withStorybookPath).toBeTruthy();
    const fs2 = require('fs');
    const src = fs2.readFileSync(withStorybookPath, 'utf8');
    // Must export a function as module.exports
    expect(src).toContain('module.exports = withStorybook');
    // Must expose named export
    expect(src).toContain('module.exports.withStorybook = withStorybook');
    // Must delegate to applySherloTransforms
    expect(src).toContain('applySherloTransforms');
    // Must resolve storybook peer dep
    expect(src).toContain('@storybook/react-native/metro/withStorybook');
  });
});

// ---------------------------------------------------------------------------
// applySherloTransforms - module shape
// ---------------------------------------------------------------------------

describe('applySherloTransforms - module shape', () => {
  it('exports applySherloTransforms as default', () => {
    expect(typeof applySherloTransforms).toBe('function');
  });

  it('does NOT export createSherloStorybook (removed API)', () => {
    expect((applySherloTransforms as any).createSherloStorybook).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// enabled: false → Sherlo plumbing still installed
// ---------------------------------------------------------------------------

describe('applySherloTransforms - enabled: false still installs Sherlo plumbing', () => {
  it('adds resolver.resolveRequest even when enabled: false', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-disabled-test-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(typeof result.resolver?.resolveRequest).toBe('function');
  });

  it('injects Sherlo polyfill via serializer.getPolyfills even when enabled: false', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-disabled-pol-test-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const polyfills = result.serializer.getPolyfills({});
    expect(polyfills).toContain(POLYFILL_PATH);
  });

  it('generates storybook-wrapper.js even when enabled: false', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-disabled-wrap-test-'));
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
    const exists = fs.existsSync(wrapperPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(exists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sherlo Metro transforms applied
// ---------------------------------------------------------------------------

describe('applySherloTransforms - Sherlo transforms applied', () => {
  it('adds resolver.resolveRequest when enabled is true', () => {
    const result = runTransform({ enabled: true });
    expect(typeof result.resolver?.resolveRequest).toBe('function');
  });

  it('adds resolver.resolveRequest when enabled is undefined (default)', () => {
    const result = runTransform();
    expect(typeof result.resolver?.resolveRequest).toBe('function');
  });

  it('injects Sherlo polyfill into getPolyfills when enabled: true', () => {
    const result = runTransform({ enabled: true });
    const polyfills = result.serializer.getPolyfills({});
    expect(polyfills).toContain(POLYFILL_PATH);
  });

  it('injects Sherlo polyfill when no options provided', () => {
    const result = runTransform();
    const polyfills = result.serializer.getPolyfills({});
    expect(polyfills).toContain(POLYFILL_PATH);
  });

  it('preserves base polyfills from existing serializer.getPolyfills', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-base-test-'));
    const basePolyfill = '/fake/base.js';
    const configWithPolyfills = {
      projectRoot: tmpDir,
      resolver: {},
      serializer: { getPolyfills: () => [basePolyfill] },
    };
    const result = applySherloTransforms(configWithPolyfills, {});
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const polyfills = result.serializer.getPolyfills({});
    expect(polyfills).toContain(basePolyfill);
    expect(polyfills).toContain(POLYFILL_PATH);
  });

  it('generates storybook-wrapper.js on disk', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-wrapper-gen-test-'));
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} });
    const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
    const exists = fs.existsSync(wrapperPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(exists).toBe(true);
  });

  it('redirects @storybook/react-native to the generated wrapper', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-redirect-test-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} });
    const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
    const fakeContext = {
      originModulePath: '/some/other/module.js',
      resolveRequest: (_ctx: any, mod: string) => ({ type: 'sourceFile', filePath: mod }),
    };
    const resolved = result.resolver.resolveRequest(fakeContext, '@storybook/react-native', 'ios');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(resolved).toEqual({ type: 'sourceFile', filePath: wrapperPath });
  });

  it('self-bypass: wrapper module importing @storybook/react-native falls through', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-bypass-test-'));
    const result = applySherloTransforms({ projectRoot: tmpDir, resolver: {} });
    const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
    const fakeContext = {
      originModulePath: wrapperPath,
      resolveRequest: (_ctx: any, mod: string) => ({ type: 'sourceFile', filePath: '/real/' + mod }),
    };
    const resolved = result.resolver.resolveRequest(fakeContext, '@storybook/react-native', 'ios');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(resolved).toEqual({ type: 'sourceFile', filePath: '/real/@storybook/react-native' });
  });
});

// ---------------------------------------------------------------------------
// Generated wrapper file contents
// ---------------------------------------------------------------------------

describe('generated storybook-wrapper.js - content', () => {
  let wrapperContent: string;

  beforeAll(() => {
    wrapperContent = readGeneratedWrapper();
  });

  it('contains SHERLO_STORYBOOK_CONFIG_PATH constant', () => {
    expect(wrapperContent).toContain('SHERLO_STORYBOOK_CONFIG_PATH');
  });

  it('exports __sherloStorybookConfigPath', () => {
    expect(wrapperContent).toContain('exports.__sherloStorybookConfigPath');
  });

  it('exports __sherloStorybookEntry', () => {
    expect(wrapperContent).toContain('exports.__sherloStorybookEntry');
  });

  it('sets SHERLO_STORYBOOK_CONFIG_PATH to null when no configPath provided', () => {
    expect(wrapperContent).toContain('var SHERLO_STORYBOOK_CONFIG_PATH = null;');
  });

  it('sets __sherloStorybookEntry to null when no configPath provided', () => {
    expect(wrapperContent).toContain('exports.__sherloStorybookEntry = null;');
  });

  it('__sherloStorybookEntry is a lazy loader function, not an eager require', () => {
    expect(wrapperContent).not.toMatch(/exports\.__sherloStorybookEntry = require\(/);
  });

  it('sets SHERLO_STORYBOOK_CONFIG_PATH to resolved path when configPath is provided', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-configpath-test-'));
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { configPath: '.rnstorybook' });
    const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
    const content = fs.readFileSync(wrapperPath, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const expected = JSON.stringify(path.resolve(tmpDir, '.rnstorybook'));
    expect(content).toContain('var SHERLO_STORYBOOK_CONFIG_PATH = ' + expected + ';');
  });

  it('bakes a lazy loader with static require literal for the entry when configPath is provided', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-entry-test-'));
    applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { configPath: '.rnstorybook' });
    const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
    const content = fs.readFileSync(wrapperPath, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const resolvedEntry = JSON.stringify(path.resolve(tmpDir, '.rnstorybook') + '/index');
    expect(content).toContain(
      'exports.__sherloStorybookEntry = function () { return require(' + resolvedEntry + '); };'
    );
  });

  it('does NOT require @sherlo/react-native-storybook at the top level', () => {
    const topLevelSherloRequire = /^var sherlo = require\('@sherlo\/react-native-storybook'\)/m;
    expect(wrapperContent).not.toMatch(topLevelSherloRequire);
  });

  it('deep-requires addStorybookToDevMenu lazily inside patchedStart', () => {
    const lazyRequire = /[ \t]+var addStorybookToDevMenu = require\('@sherlo\/react-native-storybook\/dist\/addStorybookToDevMenu'\)\.default/;
    expect(wrapperContent).toMatch(lazyRequire);
  });

  it('deep-requires addStorybookToDevMenu AFTER the re-export loop', () => {
    const reExportIdx = wrapperContent.indexOf('Object.keys(real).forEach');
    const devMenuRequireIdx = wrapperContent.indexOf("var addStorybookToDevMenu = require('@sherlo/react-native-storybook/dist/addStorybookToDevMenu').default");
    expect(reExportIdx).toBeGreaterThan(-1);
    expect(devMenuRequireIdx).toBeGreaterThan(-1);
    expect(devMenuRequireIdx).toBeGreaterThan(reExportIdx);
  });

  it('passes params ?? {} to getStorybook so undefined params use Storybook defaults', () => {
    const paramsGuard = /getStorybook\(view,\s*params\s*!=\s*null\s*\?\s*params\s*:\s*\{\}\)/;
    expect(wrapperContent).toMatch(paramsGuard);
  });

  it('does NOT emit STORYBOOK_LOADED inside patchedStart', () => {
    expect(wrapperContent).not.toContain("'STORYBOOK_LOADED'");
    expect(wrapperContent).not.toContain('"STORYBOOK_LOADED"');
  });

  it('re-exports keys from the real Storybook module via forEach loop', () => {
    expect(wrapperContent).toContain('Object.keys(real).forEach');
    expect(wrapperContent).toContain("get: function () { return real[key]; }");
  });
});
