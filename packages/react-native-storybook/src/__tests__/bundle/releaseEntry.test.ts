'use strict';

// ---------------------------------------------------------------------------
// The launch entry in a bundle made with `npx react-native bundle`
// ---------------------------------------------------------------------------
//
// That command hands Metro the entry as a path and never asks the resolver for it, so Sherlo's
// resolver cannot swap the entry there. Its transformer serves the launch entry's source in place
// of the app entry's source instead, and the app side runs from a copy of the app entry.
//
// Builds a default-setup fixture app with REAL Metro, through the real bundler wrapper
// (metro/withStorybook.js), the way mockBundle.test.ts builds its fixture. Metro.runBuild takes
// the same road as `npx react-native bundle`: the entry is a path. Every package the bundle reads
// (the SDK, Storybook, React Native) is a small stand-in, in CommonJS, so the bundle runs in a
// plain JavaScript context and the test reads which side it launched.

import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

import {
  SDK_FOLDER_IN_FIXTURE,
  createFixtureRoot,
  fixtureFileWriter,
  sherloMetroConfig,
  storybookWrapperStandInSource,
  writeSdkPackageJson,
  writeStandInPackage,
} from './fixtureMetroConfig';

const Metro = require('metro');
const { APP_SIDE_REQUEST } = require('../../../metro/launchTimeEntry');
const { sherloCacheFolder } = require('../../../metro/projectPaths');

// The fixture project on disk, and its root directory.
function createDefaultSetupApp(): string {
  const root = createFixtureRoot('sherlo-release-entry-');
  const write = fixtureFileWriter(root);

  write('package.json', JSON.stringify({ name: 'fixture-app', main: 'index.js' }));

  // The app's entry, with a relative import: from Sherlo's cache folder it would not resolve.
  write('index.js', "const app = require('./src/App');\nglobal.launched = app.name;\n");
  write('src/App.js', "module.exports = { name: 'THE_APP' };\n");

  // The Storybook entry file on the default setup registers itself as the app's root.
  write(
    '.rnstorybook/index.js',
    "const { AppRegistry } = require('react-native');\n" +
      "AppRegistry.registerComponent('main', function () { return 'StorybookUI'; });\n" +
      "global.launched = 'STORYBOOK';\n"
  );
  write('.rnstorybook/main.js', 'module.exports = { stories: [], addons: [] };\n');
  // Present, so Sherlo does not run Storybook's generator to write it.
  write('.rnstorybook/storybook.requires.js', 'exports.view = {};\n');

  // The SDK: its real exports map, so the launch entry's requires resolve as in an app, and
  // stand-ins for the files the launch entry reads. The mode comes from the native module, which
  // the test hands the bundle.
  writeSdkPackageJson(write);
  write(`${SDK_FOLDER_IN_FIXTURE}/dist/index.js`, 'exports.isStorybookMode = false;\n');
  write(
    `${SDK_FOLDER_IN_FIXTURE}/dist/SherloModule.js`,
    'exports.default = { getMode: function () { ' +
      'return global.nativeModuleProxy.SherloModule.getConstants().mode; } };\n'
  );
  write(
    `${SDK_FOLDER_IN_FIXTURE}/dist/addStorybookToDevMenu.js`,
    'exports.default = function () { global.storybookToggleAdded = true; };\n'
  );
  write(
    `${SDK_FOLDER_IN_FIXTURE}/dist/openStoryChannel.js`,
    'exports.startWaitingAsTheApp = function () {};\n'
  );

  // Storybook: its newer Metro wrapper swaps the app's entry for the Storybook entry file on every
  // resolution, as Storybook's own does, and its runtime package.
  writeStandInPackage(
    write,
    '@storybook/react-native',
    '10.4.0',
    'exports.start = function () {};\n'
  );
  write(
    'node_modules/@storybook/react-native/withStorybook.js',
    storybookWrapperStandInSource('newer')
  );

  writeStandInPackage(
    write,
    'react-native',
    '0.81.0',
    'exports.AppRegistry = { registerComponent: function (name) { global.registeredRoot = name; } };\n'
  );

  return root;
}

type Bundle = { bundledModules: string[]; code: string };

// `npx react-native bundle --dev false` for a build that carries the app and Storybook.
const RELEASE_BUNDLE_WITH_APP_AND_STORYBOOK = {
  env: { SHERLO_BUILD: 'app-and-storybook' },
  commandLine: ['bundle', '--dev', 'false'],
};

/**
 * Runs a release bundle with the native module reporting `mode`, and returns what it left on the
 * global object.
 */
function launch(code: string, mode: 'default' | 'storybook'): Record<string, unknown> {
  const appGlobal: Record<string, unknown> = {
    nativeModuleProxy: { SherloModule: { getConstants: () => ({ mode }) } },
  };
  vm.runInNewContext(code, appGlobal);
  return appGlobal;
}

describe('the release bundle entry', () => {
  // Real Metro builds are slower than unit tests; give them room.
  const TIMEOUT = 120_000;

  let root: string;
  let releaseBundle: Bundle;
  let developmentBundle: Bundle;
  let resolveRequest: (context: object, moduleName: string, platform: string) => any;

  beforeAll(async () => {
    root = createDefaultSetupApp();
    const { config, modulesOfLatestBuild } = await sherloMetroConfig(
      root,
      RELEASE_BUNDLE_WITH_APP_AND_STORYBOOK,
      { configPath: path.join(root, '.rnstorybook') }
    );
    resolveRequest = config.resolver.resolveRequest;

    // Both builds hand Metro the entry as a path, as `npx react-native bundle` does.
    const build = async (dev: boolean): Promise<Bundle> => {
      const { code } = await Metro.runBuild(config, {
        entry: 'index.js',
        platform: 'ios',
        dev,
        minify: false,
      });
      return { bundledModules: modulesOfLatestBuild(), code };
    };
    releaseBundle = await build(false);
    developmentBundle = await build(true);
  }, TIMEOUT);

  afterAll(() => {
    // root is unset when beforeAll failed before it made the fixture.
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("the transformer serves the launch entry in place of the app entry's source", () => {
    // The bundle's entry is the app's entry file, now holding the launch entry.
    expect(releaseBundle.bundledModules).toContain(path.join(root, 'index.js'));
    expect(releaseBundle.code).toContain('.getMode()');

    // At launch the mode picks the side: the app, with Storybook in the developer menu...
    const appLaunch = launch(releaseBundle.code, 'default');
    expect(appLaunch.launched).toBe('THE_APP');
    expect(appLaunch.storybookToggleAdded).toBe(true);
    expect(appLaunch.registeredRoot).toBeUndefined();

    // ...or Storybook, and the app's side never runs.
    const storybookLaunch = launch(releaseBundle.code, 'storybook');
    expect(storybookLaunch.launched).toBe('STORYBOOK');
    expect(storybookLaunch.registeredRoot).toBe('main');

    // CONTROL: a development bundle made the same way keeps the app entry's own source.
    expect(developmentBundle.bundledModules).toContain(path.join(root, 'index.js'));
    expect(developmentBundle.code).not.toContain('.getMode()');
    expect(developmentBundle.code).toContain('global.launched = app.name');
  });

  it('a copy of the app entry resolves its imports as the original file did', () => {
    const appEntryCopy = path.join(sherloCacheFolder(root), 'app-entry-original.js');

    // The app's side is the copy, and its relative import of ./src/App reached the app.
    expect(releaseBundle.bundledModules).toContain(appEntryCopy);
    expect(releaseBundle.bundledModules).toContain(path.join(root, 'src/App.js'));
    expect(launch(releaseBundle.code, 'default').launched).toBe('THE_APP');

    // A release bundle whose entry the resolver answers (the Expo exporter) reaches the app entry
    // from the generated launch entry: its app side is the copy too, or the app entry, served as
    // the launch entry, would run the launch twice.
    const launchEntry = path.join(sherloCacheFolder(root), 'launch-entry.js');
    const appSideOf = (dev: boolean) =>
      resolveRequest(
        { originModulePath: launchEntry, dev, resolveRequest: () => null },
        APP_SIDE_REQUEST,
        'ios'
      );
    expect(appSideOf(false)).toEqual({ type: 'sourceFile', filePath: appEntryCopy });
    expect(appSideOf(true)).toEqual({ type: 'sourceFile', filePath: path.join(root, 'index.js') });

    // CONTROL: a development bundle never reads the copy.
    expect(developmentBundle.bundledModules).not.toContain(appEntryCopy);
    expect(developmentBundle.bundledModules).toContain(path.join(root, 'src/App.js'));
  });
});
