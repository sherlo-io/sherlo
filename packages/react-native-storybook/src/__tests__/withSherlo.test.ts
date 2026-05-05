'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// metro.js is a CJS file at the package root (../../ from src/__tests__/)
const metro = require('../../metro.js');

const POLYFILL_PATH = path.resolve(__dirname, '../../metro/polyfill.js');

// Minimal stub for withStorybook: returns the config object with any opts merged in,
// so callers can verify Sherlo transforms are applied ON TOP of the withStorybook result.
function makeWithStorybook(opts?: { returnValue?: any }) {
  return function withStorybook(config: any, _options?: any) {
    return opts?.returnValue ?? config;
  };
}

function makeWithSherloStorybook(withStorybookOpts?: { returnValue?: any }) {
  const withStorybook = makeWithStorybook(withStorybookOpts);
  return metro.createSherloStorybook(withStorybook);
}

// Helper: run the factory-produced function with a temp projectRoot,
// clean up afterwards, and return the Metro config result.
function runFactory(
  sherloOpts?: Record<string, unknown>,
  withStorybookReturnOverride?: any
): any {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-factory-test-'));
  const withSherloStorybook = makeWithSherloStorybook(
    withStorybookReturnOverride !== undefined
      ? { returnValue: withStorybookReturnOverride }
      : undefined
  );
  const baseConfig = { projectRoot: tmpDir, resolver: {} };
  const result = withSherloStorybook(baseConfig, sherloOpts);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

// Helper: generate wrapper content on disk and return its text.
function readGeneratedWrapper(configPath?: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-wrapper-test-'));
  const withSherloStorybook = makeWithSherloStorybook();
  const baseConfig = { projectRoot: tmpDir, resolver: {} };
  withSherloStorybook(baseConfig, configPath !== undefined ? { configPath } : undefined);
  const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
  const content = fs.readFileSync(wrapperPath, 'utf8');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return content;
}

// ---------------------------------------------------------------------------
// createSherloStorybook - factory shape
// ---------------------------------------------------------------------------

describe('createSherloStorybook - factory', () => {
  it('exports createSherloStorybook', () => {
    expect(typeof metro.createSherloStorybook).toBe('function');
  });

  it('does NOT export withSherlo (removed API)', () => {
    expect(metro.withSherlo).toBeUndefined();
  });

  it('returns a function with the same arity as the provided withStorybook', () => {
    const withStorybook = makeWithStorybook();
    const wrapped = metro.createSherloStorybook(withStorybook);
    expect(typeof wrapped).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// enabled: false → complete passthrough (no Sherlo transforms)
// ---------------------------------------------------------------------------

describe('createSherloStorybook - enabled: false passthrough', () => {
  it('returns the withStorybook result unchanged (same reference)', () => {
    const sentinel = { projectRoot: '/fake', resolver: { sentinel: true } };
    const withStorybook = () => sentinel;
    const withSherloStorybook = metro.createSherloStorybook(withStorybook);
    const result = withSherloStorybook({ projectRoot: '/fake', resolver: {} }, { enabled: false });
    expect(result).toBe(sentinel);
  });

  it('does NOT add resolver.resolveRequest', () => {
    const inputConfig = { projectRoot: '/fake', resolver: {} };
    const withSherloStorybook = metro.createSherloStorybook((c: any) => c);
    const result = withSherloStorybook(inputConfig, { enabled: false });
    expect(result.resolver?.resolveRequest).toBeUndefined();
  });

  it('does NOT inject polyfill via serializer.getPolyfills', () => {
    const inputConfig = { projectRoot: '/fake', resolver: {} };
    const withSherloStorybook = metro.createSherloStorybook((c: any) => c);
    const result = withSherloStorybook(inputConfig, { enabled: false });
    expect(result.serializer).toBeUndefined();
  });

  it('does NOT generate storybook-wrapper.js', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-disabled-test-'));
    const withSherloStorybook = metro.createSherloStorybook((c: any) => c);
    withSherloStorybook({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
    const exists = fs.existsSync(wrapperPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(exists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// enabled: true / undefined → Sherlo Metro transforms applied
// ---------------------------------------------------------------------------

describe('createSherloStorybook - Sherlo transforms applied', () => {
  it('adds resolver.resolveRequest when enabled is true', () => {
    const result = runFactory({ enabled: true });
    expect(typeof result.resolver?.resolveRequest).toBe('function');
  });

  it('adds resolver.resolveRequest when enabled is undefined (default)', () => {
    const result = runFactory();
    expect(typeof result.resolver?.resolveRequest).toBe('function');
  });

  it('injects Sherlo polyfill into getPolyfills when enabled: true', () => {
    const result = runFactory({ enabled: true });
    const polyfills = result.serializer.getPolyfills({});
    expect(polyfills).toContain(POLYFILL_PATH);
  });

  it('injects Sherlo polyfill when no options provided', () => {
    const result = runFactory();
    const polyfills = result.serializer.getPolyfills({});
    expect(polyfills).toContain(POLYFILL_PATH);
  });

  it('preserves base polyfills from existing serializer.getPolyfills', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-base-test-'));
    const basePolyfill = '/fake/base.js';
    const withSherloStorybook = makeWithSherloStorybook({
      returnValue: {
        projectRoot: tmpDir,
        resolver: {},
        serializer: { getPolyfills: () => [basePolyfill] },
      },
    });
    const result = withSherloStorybook({ projectRoot: tmpDir, resolver: {} });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const polyfills = result.serializer.getPolyfills({});
    expect(polyfills).toContain(basePolyfill);
    expect(polyfills).toContain(POLYFILL_PATH);
  });

  it('generates storybook-wrapper.js on disk', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-wrapper-gen-test-'));
    const withSherloStorybook = makeWithSherloStorybook();
    withSherloStorybook({ projectRoot: tmpDir, resolver: {} });
    const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
    const exists = fs.existsSync(wrapperPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(exists).toBe(true);
  });

  it('redirects @storybook/react-native to the generated wrapper', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-redirect-test-'));
    const withSherloStorybook = makeWithSherloStorybook();
    const result = withSherloStorybook({ projectRoot: tmpDir, resolver: {} });
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
    const withSherloStorybook = makeWithSherloStorybook();
    const result = withSherloStorybook({ projectRoot: tmpDir, resolver: {} });
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

  it('sets SHERLO_STORYBOOK_CONFIG_PATH to resolved path when configPath is provided', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-configpath-test-'));
    const withSherloStorybook = makeWithSherloStorybook();
    withSherloStorybook({ projectRoot: tmpDir, resolver: {} }, { configPath: '.rnstorybook' });
    const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
    const content = fs.readFileSync(wrapperPath, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const expected = JSON.stringify(path.resolve(tmpDir, '.rnstorybook'));
    expect(content).toContain('var SHERLO_STORYBOOK_CONFIG_PATH = ' + expected + ';');
  });

  it('bakes a static require literal for the entry when configPath is provided', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-entry-test-'));
    const withSherloStorybook = makeWithSherloStorybook();
    withSherloStorybook({ projectRoot: tmpDir, resolver: {} }, { configPath: '.rnstorybook' });
    const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
    const content = fs.readFileSync(wrapperPath, 'utf8');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const resolvedEntry = JSON.stringify(path.resolve(tmpDir, '.rnstorybook') + '/index');
    expect(content).toContain('exports.__sherloStorybookEntry = require(' + resolvedEntry + ');');
  });

  it('does NOT require @sherlo/react-native-storybook at the top level', () => {
    const topLevelSherloRequire = /^var sherlo = require\('@sherlo\/react-native-storybook'\)/m;
    expect(wrapperContent).not.toMatch(topLevelSherloRequire);
  });

  it('requires @sherlo/react-native-storybook lazily inside patchedStart', () => {
    const lazyRequire = /[ \t]+var sherlo = require\('@sherlo\/react-native-storybook'\)/;
    expect(wrapperContent).toMatch(lazyRequire);
  });

  it('requires @sherlo/react-native-storybook AFTER the re-export loop', () => {
    const reExportIdx = wrapperContent.indexOf('Object.keys(real).forEach');
    const sherloRequireIdx = wrapperContent.indexOf("var sherlo = require('@sherlo/react-native-storybook')");
    expect(reExportIdx).toBeGreaterThan(-1);
    expect(sherloRequireIdx).toBeGreaterThan(-1);
    expect(sherloRequireIdx).toBeGreaterThan(reExportIdx);
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
