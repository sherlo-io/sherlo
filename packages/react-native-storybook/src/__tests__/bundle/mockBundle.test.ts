'use strict';

// ---------------------------------------------------------------------------
// Bundle lane (SHERLO-1734 Phase 2)
// ---------------------------------------------------------------------------
//
// JS-only lane (no device/emulator): it builds a tiny fixture app with REAL
// Metro programmatically and asserts on the bundle output:
//   - experimentalMocks: true  -> the mock shim is present (the mocked import was
//                                 redirected through createMockable).
//   - experimentalMocks: false -> zero mocking artifacts (opt-in gate off, SHERLO-1764).
//
// This runs under `yarn test` alongside the unit tests, so a red bundle lane
// fails the PR.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const Metro = require('metro');
const { getDefaultConfig } = require('metro-config');
const applySherloTransforms = require('../../../metro/applySherloTransforms');

const MOCKS_DIR_FRAGMENT = path.join('.cache', 'sherlo', 'mocks');

// Builds the fixture project on disk and returns its root directory.
//
// Layout:
//   index.js                         entry - imports the mocked lib (CommonJS)
//   src/Widget.stories.js            declares parameters.sherlo.mocks
//   node_modules/mocked-lib          the module being mocked
//   node_modules/@sherlo/...         a minimal stand-in for the SDK package that
//                                    provides the `./mocking` export the shim needs
function createFixture(): string {
  // realpath so projectRoot matches the path Metro's file watcher indexes
  // (macOS /var -> /private/var); otherwise Metro cannot SHA-1 the entry file.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-bundle-fixture-')));

  const write = (rel: string, content: string) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  };

  // Entry: CommonJS so no ESM transform is required for the fixture itself.
  write('index.js', "const lib = require('mocked-lib');\nmodule.exports = lib.greeting();\n");

  // Story file: only ever read from disk by the config-time scan.
  write(
    'src/Widget.stories.js',
    "export const Basic = { parameters: { sherlo: { mocks: { 'mocked-lib': { greeting: () => 'mocked' } } } } };\n"
  );

  // The module being mocked - carries a distinctive marker so we can find it.
  write(
    'node_modules/mocked-lib/package.json',
    JSON.stringify({ name: 'mocked-lib', version: '1.0.0', main: 'index.js' })
  );
  write(
    'node_modules/mocked-lib/index.js',
    "module.exports = { greeting: function () { return 'MOCKED_LIB_REAL_MODULE'; } };\n"
  );

  // Minimal stand-in for @sherlo/react-native-storybook providing createMockable
  // via the ./mocking export the shim requires. Both the exports map and a
  // physical subpath file are provided so it resolves whether or not Metro
  // enforces package exports.
  const sherloPkg = {
    name: '@sherlo/react-native-storybook',
    version: '1.0.0',
    main: 'index.js',
    exports: {
      './mocking': {
        'react-native': './dist/mocking/index.js',
        require: './dist/mocking/index.js',
        default: './dist/mocking/index.js',
      },
    },
  };
  write('node_modules/@sherlo/react-native-storybook/package.json', JSON.stringify(sherloPkg));
  write('node_modules/@sherlo/react-native-storybook/index.js', 'module.exports = {};\n');
  const createMockableStub =
    'exports.createMockable = function createMockable(key, real) { return real; };\n';
  write('node_modules/@sherlo/react-native-storybook/dist/mocking/index.js', createMockableStub);
  write('node_modules/@sherlo/react-native-storybook/mocking/index.js', createMockableStub);

  return root;
}

async function buildBundle(root: string, opts: { experimentalMocks: boolean }): Promise<string> {
  const baseConfig = await getDefaultConfig(root);

  // Metro's own runtime/polyfills and babel helpers live in the repo
  // node_modules; the fixture only has the app-level packages. Watch and resolve
  // against both. Use the node crawler (watchman does not cover the OS temp dir)
  // and disable caches so each build is fresh.
  const repoNodeModules = path.dirname(path.dirname(require.resolve('metro-runtime/package.json')));
  // The @sherlo package dir, so the sherlo polyfill.js (added for the enabled path)
  // is crawlable.
  const packageRoot = path.resolve(__dirname, '../../..');
  baseConfig.watchFolders = [root, repoNodeModules, packageRoot];
  baseConfig.resolver.nodeModulesPaths = [path.join(root, 'node_modules'), repoNodeModules];
  baseConfig.resolver.useWatchman = false;
  baseConfig.cacheStores = [];
  baseConfig.resetCache = true;

  // applySherloTransforms is exactly what withStorybook() applies under the hood.
  const config = applySherloTransforms(baseConfig, opts);

  const { code } = await Metro.runBuild(config, {
    entry: 'index.js',
    platform: 'ios',
    dev: false,
    minify: false,
  });
  return code;
}

describe('bundle lane - module mocking shims in real Metro output', () => {
  // Real Metro builds are slower than unit tests; give them room.
  const TIMEOUT = 120_000;

  it(
    'experimentalMocks: true -> the mocked import is redirected through a createMockable shim',
    async () => {
      const root = createFixture();
      try {
        const code = await buildBundle(root, { experimentalMocks: true });

        // The shim's body (a createMockable call for the mocked key) is bundled.
        expect(code).toContain('createMockable');
        expect(code).toContain('mocked-lib');
        // The real module is still present (the shim requires it under the hood).
        expect(code).toContain('MOCKED_LIB_REAL_MODULE');

        // A shim file was physically emitted for the scanned key.
        const mocksDir = path.join(root, 'node_modules', MOCKS_DIR_FRAGMENT);
        const shims = fs.readdirSync(mocksDir).filter((f) => f.startsWith('mock-'));
        expect(shims.length).toBe(1);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    TIMEOUT
  );

  it(
    'experimentalMocks: false -> the bundle contains zero mocking artifacts (opt-in gate off)',
    async () => {
      const root = createFixture();
      try {
        const code = await buildBundle(root, { experimentalMocks: false });

        // The real module is bundled directly, with no shim indirection.
        expect(code).toContain('MOCKED_LIB_REAL_MODULE');
        expect(code).not.toContain('createMockable');
        expect(code).not.toContain(MOCKS_DIR_FRAGMENT);

        // No shim directory was created at all.
        expect(fs.existsSync(path.join(root, 'node_modules', MOCKS_DIR_FRAGMENT))).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    TIMEOUT
  );
});
