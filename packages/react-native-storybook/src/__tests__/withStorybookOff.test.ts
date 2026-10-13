import * as fs from 'fs';
import * as path from 'path';

import { createFixtureRoot, fixtureFileWriter } from './bundle/fixtureMetroConfig';
import { enterBundlingProcess } from './bundlingProcess';

// The real wrapper, with the real Storybook wrapper behind it (a dev dependency of this package).
const withStorybook = require('../../metro/withStorybook');
const { sherloCacheFolder } = require('../../metro/projectPaths');

const SDK_PACKAGE_NAME = '@sherlo/react-native-storybook';
const STAND_IN_MODULE = '@sherlo/react-native-storybook/dist/offStandIn.js';

// The three ways a build reaches the off road: the setting off in any build, and the setting
// unset in a release bundle, told either by NODE_ENV (Expo's CLI) or by `--dev false` on the
// bundling command line (bare React Native's).
const OFF_ROADS = [
  { name: 'SHERLO_BUILD=off in a debug bundle', env: { SHERLO_BUILD: 'off' }, argv: [] },
  { name: 'unset, NODE_ENV=production', env: { NODE_ENV: 'production' }, argv: [] },
  { name: 'unset, --dev false', env: {}, argv: ['bundle', '--dev', 'false'] },
  { name: 'unset, --dev=false', env: {}, argv: ['bundle', '--dev=false'] },
];

// A project with a Storybook config folder and one story that declares a mock, so the mock layer
// would emit a shim if it ran.
function createProject(): string {
  const root = createFixtureRoot('sherlo-off-road-');
  const write = fixtureFileWriter(root);
  write(
    '.rnstorybook/main.js',
    "module.exports = { stories: ['../src/**/*.stories.?(ts|tsx|js|jsx)'], addons: [] };\n"
  );
  write('.rnstorybook/index.js', "export { view as default } from './storybook.requires';\n");
  write(
    'src/Widget.stories.js',
    "import { mock } from '@sherlo/react-native-storybook';\n" +
      "export const Basic = { parameters: { sherlo: { mocks: [mock(() => import('mocked-lib'), {})] } } };\n"
  );
  write(
    'node_modules/mocked-lib/package.json',
    JSON.stringify({ name: 'mocked-lib', version: '1.0.0', main: 'index.js' })
  );
  write('node_modules/mocked-lib/index.js', 'module.exports = {};\n');
  return root;
}

// What Metro's own resolver would answer: the module, as a file under the project.
function metroContext(root: string) {
  return {
    originModulePath: path.join(root, 'index.js'),
    resolveRequest: (_context: unknown, moduleName: string) => ({
      type: 'sourceFile',
      filePath: path.join(root, 'node_modules', moduleName),
    }),
  };
}

describe('the bundler wrapper in a release bundle without Sherlo', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createProject();
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  // The wrapper reads the environment and command line only while the config loads.
  function wrapOnRoad(road: { env: Record<string, string>; argv: string[] }) {
    const leaveBundlingProcess = enterBundlingProcess(road.env, road.argv);
    try {
      return withStorybook(
        { projectRoot, resolver: {} },
        { configPath: path.join(projectRoot, '.rnstorybook') }
      );
    } finally {
      leaveBundlingProcess();
    }
  }

  it('with the setting off or unset in a release bundle the SDK import resolves to the stand-in', () => {
    for (const road of OFF_ROADS) {
      const config = wrapOnRoad(road);
      const context = metroContext(projectRoot);
      const resolve = (moduleName: string) =>
        config.resolver.resolveRequest(context, moduleName, 'ios');

      // The package root import is the stand-in.
      expect(resolve(SDK_PACKAGE_NAME), road.name).toEqual({
        type: 'sourceFile',
        filePath: path.join(projectRoot, 'node_modules', STAND_IN_MODULE),
      });
      // Every other import still reaches the project's own resolver.
      expect(resolve('mocked-lib').filePath, road.name).toBe(
        path.join(projectRoot, 'node_modules', 'mocked-lib')
      );
      // Storybook leaves itself out, through its own wrapper.
      expect(resolve('@storybook/react-native'), road.name).toEqual({ type: 'empty' });
    }
  });

  it('with the setting off or unset in a release bundle no mock shim, redirect or middleware is added', () => {
    for (const road of OFF_ROADS) {
      const config = wrapOnRoad(road);

      expect(config.server, road.name).toBeUndefined();
      expect(config.serializer, road.name).toBeUndefined();
      expect(config.transformer, road.name).toBeUndefined();
      // No wrapper, no flag file and no shim were written: the cache folder was never made.
      expect(fs.existsSync(sherloCacheFolder(projectRoot)), road.name).toBe(false);
    }

    // CONTROL: the same project with Sherlo in it gets all three, or this test proves nothing.
    const config = wrapOnRoad({ env: { SHERLO_BUILD: 'app-and-storybook' }, argv: [] });
    expect(typeof config.server.enhanceMiddleware).toBe('function');
    expect(typeof config.serializer.getPolyfills).toBe('function');
    expect(
      config.resolver.resolveRequest(metroContext(projectRoot), '@storybook/react-native', 'ios')
    ).toEqual({
      type: 'sourceFile',
      filePath: path.join(sherloCacheFolder(projectRoot), 'storybook-wrapper.js'),
    });
    expect(fs.readdirSync(path.join(sherloCacheFolder(projectRoot), 'mocks')).length).toBe(1);
  });

  it('a debug bundle with the setting unset keeps the SDK and Storybook, as before', () => {
    const config = wrapOnRoad({ env: {}, argv: ['start'] });
    expect(
      config.resolver.resolveRequest(metroContext(projectRoot), SDK_PACKAGE_NAME, 'ios').filePath
    ).toBe(path.join(projectRoot, 'node_modules', SDK_PACKAGE_NAME));
    expect(typeof config.server.enhanceMiddleware).toBe('function');
  });

  it('an unknown SHERLO_BUILD value stops the wrapper before anything is written', () => {
    expect(() => wrapOnRoad({ env: { SHERLO_BUILD: 'on' }, argv: [] })).toThrow(
      'Unknown SHERLO_BUILD value "on". Use storybook, app-and-storybook or off, or leave it unset.'
    );
    expect(fs.existsSync(sherloCacheFolder(projectRoot))).toBe(false);
  });
});
