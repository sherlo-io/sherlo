import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// metro.js is a CJS file at the package root (../../ from src/__tests__/)
const metro = require('../../metro.js');

const POLYFILL_PATH = path.resolve(__dirname, '../../metro/polyfill.js');

function makeResult(options?: Record<string, unknown>) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-metro-test-'));
  const result = metro.withSherlo({ projectRoot: tmpDir, resolver: {} }, options);
  // Clean up wrapper cache dir if it was created
  const cacheDir = path.join(tmpDir, 'node_modules', '.cache', 'sherlo');
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } else {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return result;
}

function makeWrapperContent(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-metro-test-'));
  const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
  // withSherlo writes the wrapper when called with projectRoot = tmpDir
  metro.withSherlo({ projectRoot: tmpDir, resolver: {} });
  const content = fs.readFileSync(wrapperPath, 'utf8');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return content;
}

describe('withSherlo metro wrapper (Bug 1 & Bug 2 fixes)', () => {
  let wrapperContent: string;

  beforeAll(() => {
    wrapperContent = makeWrapperContent();
  });

  it('does NOT require @sherlo/react-native-storybook at the top level', () => {
    // Split into lines and find the top-level sherlo require.
    // Top-level = not inside a function body (no leading spaces before var sherlo).
    const topLevelSherloRequire = /^var sherlo = require\('@sherlo\/react-native-storybook'\)/m;
    expect(wrapperContent).not.toMatch(topLevelSherloRequire);
  });

  it('requires @sherlo/react-native-storybook lazily inside patchedStart', () => {
    // Must appear inside the function body (indented with spaces)
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

  it('passes params ?? {} to sherlo.getStorybook so undefined params use Storybook defaults', () => {
    // Ensure we guard against null/undefined params before passing to getStorybook
    const paramsGuard = /sherlo\.getStorybook\(view,\s*params\s*!=\s*null\s*\?\s*params\s*:\s*\{\}\)/;
    expect(wrapperContent).toMatch(paramsGuard);
  });

  it('does NOT emit STORYBOOK_LOADED inside patchedStart', () => {
    // The signal must be deferred to the React component (useEffect in getStorybook.tsx)
    expect(wrapperContent).not.toContain("'STORYBOOK_LOADED'");
    expect(wrapperContent).not.toContain('"STORYBOOK_LOADED"');
  });

  it('still re-exports updateView from the real Storybook module', () => {
    // The forEach re-export loop must be present so isStorybook7.ts can detect
    // updateView and correctly set isStorybook7=false for Storybook 8+
    expect(wrapperContent).toContain('Object.keys(real).forEach');
    expect(wrapperContent).toContain("get: function () { return real[key]; }");
  });
});

// ---------------------------------------------------------------------------
// Tests: polyfill injection — always unconditional (self-gates via JSI binding)
// ---------------------------------------------------------------------------

describe('withSherlo — polyfill injection', () => {
  it('always injects polyfill into getPolyfills (self-gates at runtime via __sherloRuntimeMode_v1)', () => {
    const result = makeResult();
    const polyfills = result.serializer.getPolyfills({});
    expect(polyfills).toContain(POLYFILL_PATH);
  });

  it('passes through base polyfills from existing serializer.getPolyfills', () => {
    const basePolyfill = '/fake/base.js';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-base-test-'));
    const result = metro.withSherlo({
      projectRoot: tmpDir,
      resolver: {},
      serializer: { getPolyfills: () => [basePolyfill] },
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const polyfills = result.serializer.getPolyfills({});
    expect(polyfills).toContain(basePolyfill);
    expect(polyfills).toContain(POLYFILL_PATH);
  });
});

// ---------------------------------------------------------------------------
// Tests: withSherlo({ enabled: false }) passthrough
// ---------------------------------------------------------------------------

describe('withSherlo — enabled: false passthrough', () => {
  it('withSherlo(config, { enabled: false }) returns the input config object unchanged', () => {
    const inputConfig = { projectRoot: '/fake', resolver: { someOption: true } };
    const result = metro.withSherlo(inputConfig, { enabled: false });
    expect(result).toBe(inputConfig);
  });

  it('withSherlo(config, { enabled: false }) does NOT inject polyfill', () => {
    const inputConfig = { projectRoot: '/fake', resolver: {} };
    const result = metro.withSherlo(inputConfig, { enabled: false });
    expect(result.serializer).toBeUndefined();
  });

  it('withSherlo(config, { enabled: false }) does NOT override resolver.resolveRequest', () => {
    const inputConfig = { projectRoot: '/fake', resolver: {} };
    const result = metro.withSherlo(inputConfig, { enabled: false });
    expect(result.resolver?.resolveRequest).toBeUndefined();
  });

  it('withSherlo(config, { enabled: false }) does NOT generate storybook-wrapper.js', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-disabled-test-'));
    metro.withSherlo({ projectRoot: tmpDir, resolver: {} }, { enabled: false });
    const wrapperPath = path.join(tmpDir, 'node_modules', '.cache', 'sherlo', 'storybook-wrapper.js');
    const exists = fs.existsSync(wrapperPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(exists).toBe(false);
  });

  it('withSherlo(config, { enabled: true }) still injects polyfill', () => {
    const result = makeResult({ enabled: true });
    const polyfills = result.serializer.getPolyfills({});
    expect(polyfills).toContain(POLYFILL_PATH);
  });

  it('withSherlo(config) with no options still injects polyfill', () => {
    const result = makeResult();
    const polyfills = result.serializer.getPolyfills({});
    expect(polyfills).toContain(POLYFILL_PATH);
  });
});
