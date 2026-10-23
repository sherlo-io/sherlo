'use strict';

// Spike mocks-miss-feeld, unknown u12: can a scene's mocks be switched on before the app's entry
// file runs its first statement, with the entry file unchanged?
//
// A real Metro build of a fixture shaped like Feeld: the entry's first statement calls a mocked
// package, and the Sherlo package is imported only late, from an app module the entry reaches at
// its end. A module that switches the scene's mock on ("early") sits in the Sherlo package. Metro
// runs a module before the main one when the config's serializer.getModulesRunBeforeMainModule
// names it AND it is in the graph (metro/src/lib/getAppendScripts.js). With the hook, the entry's
// first call is the mock; with no hook, early runs only when the late import reaches it.

import * as path from 'path';
import * as vm from 'vm';

import { createFixtureRoot, fixtureFileWriter, fixtureMetroConfig } from './fixtureMetroConfig';

const fs = require('fs');
const Metro = require('metro');
const applySherloTransforms = require('../../../metro/applySherloTransforms');

const SDK = 'node_modules/@sherlo/react-native-storybook';

function createFixture(): string {
  const root = createFixtureRoot('sherlo-early-scene-');
  const write = fixtureFileWriter(root);

  write(
    'index.js',
    "globalThis.firstCall = require('mocked-lib').greeting();\nrequire('./src/late');\n"
  );
  write('src/late.js', "require('@sherlo/react-native-storybook');\n");
  write(
    'src/Scene.stories.js',
    "import { mock } from '@sherlo/react-native-storybook';\n" +
      "export const Scene = { parameters: { sherlo: { mocks: [mock(() => import('mocked-lib'), { greeting: () => 'mocked' })] } } };\n"
  );
  write(
    'node_modules/mocked-lib/package.json',
    JSON.stringify({ name: 'mocked-lib', main: 'index.js' })
  );
  write('node_modules/mocked-lib/index.js', "exports.greeting = function () { return 'real'; };\n");

  write(
    `${SDK}/package.json`,
    JSON.stringify({
      name: '@sherlo/react-native-storybook',
      main: 'index.js',
      exports: { '.': './index.js', './mocking': './mocking/index.js' },
    })
  );
  // The package's entry pulls early into the graph, as Sherlo's own index would.
  write(`${SDK}/index.js`, "require('./early');\n");
  // Stands in for the module that reads the scene the launch asked for and switches its mocks on.
  write(
    `${SDK}/early.js`,
    "globalThis.activeMocks = { 'mocked-lib': { greeting: function () { return 'mocked'; } } };\n"
  );
  // createLazyMockable as the real one behaves: each read asks the active mocks first.
  write(
    `${SDK}/mocking/index.js`,
    'exports.createLazyMockable = function (key, load) {\n' +
      '  return new Proxy({}, { get: function (_, name) {\n' +
      '    var mocks = globalThis.activeMocks && globalThis.activeMocks[key];\n' +
      '    return mocks && name in mocks ? mocks[name] : load()[name];\n' +
      '  } });\n' +
      '};\n'
  );
  return root;
}

async function firstCallOfTheEntry(runEarlyBeforeMain: boolean): Promise<string> {
  const root = createFixture();
  try {
    const config = await fixtureMetroConfig(root);
    if (runEarlyBeforeMain) {
      config.serializer.getModulesRunBeforeMainModule = () => [
        fs.realpathSync(path.join(root, SDK, 'early.js')),
      ];
    }
    const { code } = await Metro.runBuild(applySherloTransforms(config, {}), {
      entry: 'index.js',
      platform: 'ios',
      dev: false,
      minify: false,
    });
    const context: { firstCall?: string } = {};
    vm.runInNewContext(code, context);
    return context.firstCall as string;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("a scene's mocks switched on before the entry module runs", () => {
  const TIMEOUT = 60_000;

  it(
    'a module Metro runs before the main one switches the mock on before the entry calls it',
    async () => {
      expect(await firstCallOfTheEntry(true)).toBe('mocked');
    },
    TIMEOUT
  );

  it(
    "with no such hook the entry's first call is the real module",
    async () => {
      expect(await firstCallOfTheEntry(false)).toBe('real');
    },
    TIMEOUT
  );
});
