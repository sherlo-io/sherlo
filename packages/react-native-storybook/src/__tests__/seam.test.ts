/**
 * Tests for src/seam.js - the public JS surface a late-attached runtime reads
 * off `globalThis.__SHERLO_HOST__`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { minify } from 'terser';

const SEAM_PATH = path.join(__dirname, '../seam.js');
const seamSource = fs.readFileSync(SEAM_PATH, 'utf8');

describe('seam - version marker survives minification', () => {
  it('the source contains a literal string assignment, not a computed one', () => {
    // The gate (private, sherlo-runner) greps the BUILT BUNDLE for this exact
    // shape rather than evaluating any code - see design.md "Contract between
    // the halves". A computed assignment (`= String(SEAM_VERSION)`) risks a
    // minifier constant-folding it into something a plain grep would miss.
    expect(seamSource).toMatch(/globalThis\.__SHERLO_SEAM_VERSION__\s*=\s*'1'/);
  });

  it('a real minifier run still contains a greppable __SHERLO_SEAM_VERSION__ = "1"', async () => {
    const result = await minify(seamSource, { compress: true, mangle: true });
    expect(result.code).toBeTruthy();
    expect(result.code as string).toMatch(/__SHERLO_SEAM_VERSION__\s*=\s*["']1["']/);
  });
});

describe('seam - optional peers are bare try/require, not wrapped in a helper call', () => {
  // Metro's isOptionalDependency only exempts a `require()` sitting directly
  // inside a try block's statement list (collectDependencies.js) - reaching
  // for a peer through a function call loses the exemption and turns a
  // missing optional package into a build failure. `optional(() => require(x))`
  // would fail this the same way a helper function would: the require is
  // inside an arrow function passed to `optional`, not directly in a
  // try-block statement.
  const optionalRequireNames = [
    'react/jsx-runtime',
    'react-native-safe-area-context',
    'its-fine',
    'deepmerge',
    '@storybook/react-native-theming',
    'expo-dev-menu',
    'expo-constants',
    'expo-splash-screen',
    'react-native-splash-screen',
    'react-native-bootsplash',
  ];

  it.each(optionalRequireNames)('%s is reached through the optional() try/catch helper', (name) => {
    const pattern = new RegExp(
      `optional\\(\\(\\) => require\\('${name.replace(/[/.]/g, '\\$&')}'\\)\\)`
    );
    expect(seamSource).toMatch(pattern);
  });

  it('optional() itself wraps its call in try { } catch { }, directly', () => {
    expect(seamSource).toMatch(
      /function optional\(load\) \{\s*try \{\s*return load\(\);\s*\} catch \{/
    );
  });
});

/**
 * Real CommonJS execution, not Vitest module mocking: `require()` inside
 * seam.js (deliberately CJS, since it runs through Metro's own require
 * runtime in production - see the file's header) is not reliably intercepted
 * by vi.mock() under Vitest's SSR transform, the same limitation
 * installSherloIntegration.test.ts documents. Instead, this builds a real
 * node_modules layout in a temp dir - react, react-native, and a stand-in
 * @sherlo/react-native-storybook providing the frozen dist/SherloModule.js
 * and mocking exports the seam requires - and lets plain Node `require()`
 * resolve and execute the genuine seam.js against it.
 */
describe('seam - module shape (real require, temp node_modules fixture)', () => {
  function writeFixture(overrides: { mode: string; getLastStateImpl?: string }): { root: string } {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-seam-fixture-')));

    const write = (rel: string, content: string) => {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
    };

    write('seam.js', fs.readFileSync(SEAM_PATH, 'utf8'));

    write(
      'node_modules/react/index.js',
      'module.exports = { createElement: () => null, Component: class {} };\n'
    );

    write(
      'node_modules/react-native/index.js',
      [
        'const registerComponent = (appKey, provider) => {',
        "  globalThis.__seamTestCalls.push(['registerComponent', appKey, provider]);",
        '  return provider();',
        '};',
        'module.exports = { AppRegistry: { registerComponent } };',
      ].join('\n')
    );

    const sherloPkg = {
      name: '@sherlo/react-native-storybook',
      version: '1.0.0',
      main: 'index.js',
    };
    write('node_modules/@sherlo/react-native-storybook/package.json', JSON.stringify(sherloPkg));
    write('node_modules/@sherlo/react-native-storybook/index.js', 'module.exports = {};\n');
    write(
      'node_modules/@sherlo/react-native-storybook/dist/SherloModule.js',
      [
        'exports.default = {',
        `  getMode: () => '${overrides.mode}',`,
        "  getNativeVersion: () => '3.0.0',",
        "  getConfig: () => { throw new Error('Config is undefined'); },",
        `  getLastState: ${overrides.getLastStateImpl ?? '() => undefined'},`,
        '  appendFile: (path, content) => {',
        "    globalThis.__seamTestCalls.push(['appendFile', path, content]);",
        '    return Promise.resolve();',
        '  },',
        "  constants: { PROTOCOL_FILE: 'protocol.sherlo', LOG_FILE: 'log.sherlo' },",
        '};',
      ].join('\n')
    );
    write(
      'node_modules/@sherlo/react-native-storybook/mocking/index.js',
      "module.exports = { registry: 'stub-registry' };\n"
    );

    return { root };
  }

  beforeEach(() => {
    (globalThis as any).__seamTestCalls = [];
    delete (globalThis as any).__SHERLO_HOST__;
    delete (globalThis as any).__sherlo;
    delete (globalThis as any).__SHERLO_SEAM_VERSION__;
    delete (globalThis as any).__SHERLO_ATTACH__;
  });

  it('publishes globalThis.__SHERLO_HOST__ (and the __sherlo alias) with the wrapped module, constants, and mocking registry, tolerating an absent config', () => {
    const { root } = writeFixture({ mode: 'storybook' });
    try {
      require(path.join(root, 'seam.js'));
      const host = (globalThis as any).__SHERLO_HOST__;

      expect(host).toBeDefined();
      expect((globalThis as any).__sherlo).toBe(host);
      expect(host.seamVersion).toBe(1);
      expect((globalThis as any).__SHERLO_SEAM_VERSION__).toBe('1');
      expect(host.module.getNativeVersion()).toBe('3.0.0');
      expect(host.constants).toEqual({ PROTOCOL_FILE: 'protocol.sherlo', LOG_FILE: 'log.sherlo' });
      expect(host.mocking).toEqual({ registry: 'stub-registry' });
      // getConfig() throws when nothing was written for this launch (the
      // ordinary case outside a real test run) - the seam must not crash.
      expect(host.native).toEqual({
        mode: 'storybook',
        config: undefined,
        lastState: undefined,
        nativeVersion: '3.0.0',
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('tolerates a getLastState() that throws (a malformed lastState.sherlo file) without crashing bundle evaluation', () => {
    const { root } = writeFixture({
      mode: 'storybook',
      getLastStateImpl: "() => { throw new Error('lastState is corrupt'); }",
    });
    try {
      expect(() => require(path.join(root, 'seam.js'))).not.toThrow();
      const host = (globalThis as any).__SHERLO_HOST__;
      expect(host.native.lastState).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not write to the protocol file outside testing mode', () => {
    const { root } = writeFixture({ mode: 'storybook' });
    try {
      require(path.join(root, 'seam.js'));
      // Evaluating the seam calls neither appendFile nor registerComponent by
      // itself - registerComponent is only WRAPPED, never invoked, until the
      // customer's own code registers a root.
      expect((globalThis as any).__seamTestCalls).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes JS_EVAL_COMPLETE to the protocol file when mode is testing', () => {
    const { root } = writeFixture({ mode: 'testing' });
    try {
      require(path.join(root, 'seam.js'));
      const appendCalls = (globalThis as any).__seamTestCalls.filter(
        (c: any[]) => c[0] === 'appendFile'
      );
      expect(appendCalls).toHaveLength(1);
      expect(appendCalls[0][1]).toBe('protocol.sherlo');
      expect(appendCalls[0][2]).toContain('JS_EVAL_COMPLETE');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('handOff sets takenOverBy, and the wrapped AppRegistry.registerComponent defers to it', () => {
    const { root } = writeFixture({ mode: 'default' });
    try {
      require(path.join(root, 'seam.js'));
      const host = (globalThis as any).__SHERLO_HOST__;
      const RuntimeRoot = () => 'runtime-root';

      expect(host.handOff(RuntimeRoot)).toBe(true);
      expect(host.takenOverBy).toBe(RuntimeRoot);

      const ReactNative = require(path.join(root, 'node_modules/react-native'));
      const AppComponent = () => 'app-component';
      // The fixture's stub registerComponent immediately invokes the wrapped
      // resolveRoot and returns whatever component reference it picked.
      const resolved = ReactNative.AppRegistry.registerComponent('app', () => AppComponent);
      // resolveRoot defers to takenOverBy over the app's own provider.
      expect(resolved).toBe(RuntimeRoot);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reportStoryError appends to storyErrors, and attach() registers the runtime', () => {
    const { root } = writeFixture({ mode: 'default' });
    try {
      require(path.join(root, 'seam.js'));
      const host = (globalThis as any).__SHERLO_HOST__;

      expect(host.storyErrors).toEqual([]);
      host.reportStoryError({ storyId: 'a--b', message: 'boom' });
      expect(host.storyErrors).toEqual([{ storyId: 'a--b', message: 'boom' }]);

      const runtime = { name: 'fake-runtime' };
      expect(host.attach(runtime)).toBe(host);
      expect(host.runtime).toBe(runtime);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
