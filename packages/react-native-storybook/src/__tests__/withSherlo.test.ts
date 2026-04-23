import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// metro.js is a CJS file at the package root (../../ from src/__tests__/)
const metro = require('../../metro.js');

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
