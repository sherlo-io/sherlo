'use strict';

// ---------------------------------------------------------------------------
// A scene's mocks are on before the app's first module
// ---------------------------------------------------------------------------
//
// Builds an old-setup fixture app with REAL Metro, through the real bundler wrapper
// (metro/withStorybook.js), and runs the bundle. On the old setup the bundle's entry stays the
// app's own, and this one calls a mocked package in its very first statement, builds a socket
// class at load, and imports the SDK only at its end, the way an app reaches the SDK from a late
// module. So the scene's mocks are on in time only when Metro runs the SDK's early-boot module
// (src/sceneBoot.ts) before the main module, and Metro runs one there only when the config's
// serializer.getModulesRunBeforeMainModule names it and it is in the graph
// (metro/src/lib/getAppendScripts.js).
//
// The fixture's copy of the SDK holds the real early-boot module and the real list of the
// bundle's scenes (src/bundledScenes.ts), transpiled, and small stand-ins for the rest: the
// native module reads the launch off the global object, and the activation records what it was
// handed there and holds the socket class when the scene declares a network rule.

import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { transformSync } from 'esbuild';

import {
  SDK_FOLDER_IN_FIXTURE,
  createFixtureRoot,
  fixtureFileWriter,
  sherloMetroConfig,
  writeSdkPackageJson,
  writeStandInPackage,
} from './fixtureMetroConfig';

const Metro = require('metro');

const PACKAGE_ROOT = path.resolve(__dirname, '../../..');
const SCENE_ID = 'chat--conversation';

// The SDK source file at `relativePath` under src, as the built package holds it.
function transpiledSdkFile(relativePath: string): string {
  const source = fs.readFileSync(path.join(PACKAGE_ROOT, 'src', relativePath), 'utf8');
  return transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2018' }).code;
}

function createOldSetupAppWithAScene(): string {
  const root = createFixtureRoot('sherlo-early-scene-');
  const write = fixtureFileWriter(root);

  write(
    'index.js',
    "globalThis.firstCall = require('mocked-lib').greeting();\n" +
      "require('./src/chatSocket');\n" +
      "require('./src/late');\n"
  );
  write('src/chatSocket.js', 'globalThis.ChatSocket = class ChatSocket extends WebSocket {};\n');
  write('src/late.js', "require('@sherlo/react-native-storybook');\n");
  // In CommonJS, as the whole fixture is, so it needs no transform; it is the file's default
  // export, as a module's `export default` is.
  write(
    'src/chat.scenes.js',
    "const { scenes, mock, mockRequest } = require('@sherlo/react-native-storybook');\n" +
      'exports.default = scenes({\n' +
      "  mocks: [mockRequest('wss://chat.example/live', 'pending')],\n" +
      '  scenes: {\n' +
      "    Conversation: { mocks: [mock(() => import('mocked-lib'), { greeting: () => 'mocked' })] },\n" +
      '  },\n' +
      '});\n'
  );
  writeStandInPackage(
    write,
    'mocked-lib',
    '1.0.0',
    "exports.greeting = function () { return 'real'; };\n"
  );

  // Storybook's old setup, laid as buildContents.test.ts lays it.
  write(
    '.rnstorybook/main.js',
    "module.exports = { stories: ['../src/**/*.stories.js'], addons: [] };\n"
  );
  write(
    '.rnstorybook/index.js',
    "const { view } = require('./storybook.requires');\n" +
      'module.exports = view.getStorybookUI({});\n'
  );
  write(
    '.rnstorybook/storybook.requires.js',
    "import { start } from '@storybook/react-native';\n" +
      "const normalizedStories = [{ req: require.context('../src', true, /^\\.\\/(?:(?!\\.)(?=.)[^/]*?\\.stories\\.js)$/) }];\n" +
      'export const view = start({ annotations: [], storyEntries: normalizedStories });\n'
  );
  writeStandInPackage(
    write,
    '@storybook/react-native',
    '9.1.4',
    'exports.start = function () { return { getStorybookUI: function () { return null; } }; };\n'
  );

  writeSdkPackageJson(write);
  const sdk = (relativePath: string, content: string) =>
    write(`${SDK_FOLDER_IN_FIXTURE}/${relativePath}`, content);
  sdk('dist/sceneBoot.js', transpiledSdkFile('sceneBoot.ts'));
  sdk('dist/bundledScenes.js', transpiledSdkFile('bundledScenes.ts'));
  sdk('dist/settleClock.js', transpiledSdkFile('settleClock.ts'));
  // The SDK's entry imports the early-boot module, as the real one does, so it is in the graph.
  sdk(
    'dist/index.js',
    'exports.scenes = function (file) { return file; };\n' +
      'exports.mock = function (load, definition, specifierAsWritten) {\n' +
      "  return { kind: 'module', definition: definition, specifierAsWritten: specifierAsWritten };\n" +
      '};\n' +
      "exports.mockRequest = function (url) { return { kind: 'network', url: url }; };\n" +
      "require('./sceneBoot');\n"
  );
  sdk(
    'dist/SherloModule.js',
    'exports.__esModule = true;\n' +
      'exports.default = {\n' +
      '  getMode: function () { return globalThis.launch.mode; },\n' +
      '  getLastState: function () {\n' +
      "    return { requestId: 'r', nextSnapshot: { storyId: globalThis.launch.storyId } };\n" +
      '  },\n' +
      '};\n'
  );
  // The early-boot module's two reads for a launch with no scene: neither is used in these launches.
  sdk(
    'dist/getStorybook/storybookFacts.js',
    'exports.readStorybookFacts = function () { return null; };\n'
  );
  sdk(
    'dist/helpers/announceAppShowsWhatItTests.js',
    'exports.__esModule = true;\nexports.default = function () {};\n'
  );
  sdk(
    'dist/helpers/hideErrorOverlay.js',
    'exports.__esModule = true;\nexports.default = function () {};\n'
  );
  sdk('dist/loggedErrors.js', 'exports.startKeepingLoggedErrors = function () {};\n');
  sdk(
    'dist/helpers/reportStorybookLoaded.js',
    'exports.__esModule = true;\nexports.default = function () {};\n'
  );
  // The launch's id and the bundle's scenes are read as the real module reads them.
  sdk('dist/captureLaunch.js', transpiledSdkFile('captureLaunch.ts'));
  sdk('dist/captureTransport.js', 'exports.startCaptureOfTheLaunch = function () {};\n');
  sdk('dist/connection/appLine.js', 'exports.logTheLine = function () {};\n');
  // The early-boot module's other imports, for a launch of an app with no Storybook: not used here.
  sdk('dist/appMetadata.js', 'exports.collectAppMetadata = function () {};\n');
  sdk(
    'dist/runnerWalk.js',
    'exports.isDrivenByRunner = function () { return false; };\n' +
      'exports.walkTheStoryForTheRunner = function () {};\n'
  );
  sdk(
    'dist/storyOfTheApp.js',
    'exports.installTheWrapperThatWrapsWhenSherlosStorybookIsAbsent = function () {};\n'
  );
  writeStandInPackage(
    write,
    'react-native-safe-area-context',
    '5.0.0',
    'exports.initialWindowMetrics = null;\n'
  );
  sdk(
    'dist/sealedCore/loadSealedCore.js',
    'exports.getSealedCore = function () { return null; };\n'
  );
  sdk(
    'dist/getStorybook/storyMockActivation.js',
    'exports.activateSceneMocks = function (sceneId, fileMocks, sceneMocks) {\n' +
      '  globalThis.switchedOnScene = sceneId;\n' +
      '  globalThis.activeMocks = {};\n' +
      '  [].concat(fileMocks || [], sceneMocks || []).forEach(function (declared) {\n' +
      "    if (declared.kind === 'module') {\n" +
      '      globalThis.activeMocks[declared.specifierAsWritten] = declared.definition;\n' +
      '    }\n' +
      "    if (declared.kind === 'network') globalThis.WebSocket = globalThis.HeldSocket;\n" +
      '  });\n' +
      '};\n'
  );
  // createLazyMockable as the real one behaves: each read asks the active mocks first.
  sdk(
    'dist/mocking/index.js',
    'exports.createLazyMockable = function (key, load) {\n' +
      '  return new Proxy({}, { get: function (_, name) {\n' +
      '    var mocks = globalThis.activeMocks && globalThis.activeMocks[key];\n' +
      '    return mocks && name in mocks ? mocks[name] : load()[name];\n' +
      '  } });\n' +
      '};\n'
  );
  return root;
}

class RealSocket {}
class HeldSocket {}

describe('a scene is set up before the app starts', () => {
  // A real Metro build is slower than a unit test; give it room.
  const TIMEOUT = 60_000;

  let root: string;
  let appGlobal: Record<string, any>;

  beforeAll(async () => {
    root = createOldSetupAppWithAScene();
    const { config } = await sherloMetroConfig(
      root,
      { env: { SHERLO_BUILD: 'app-and-storybook' }, commandLine: ['bundle', '--dev', 'false'] },
      { configPath: path.join(root, '.rnstorybook'), useJs: true, docTools: false }
    );
    const { code } = await Metro.runBuild(config, {
      entry: 'index.js',
      platform: 'ios',
      dev: false,
      minify: false,
    });
    appGlobal = {
      launch: { mode: 'testing', storyId: SCENE_ID },
      WebSocket: RealSocket,
      HeldSocket,
    };
    vm.runInNewContext(code, appGlobal);
  }, TIMEOUT);

  afterAll(() => {
    // root is unset when beforeAll failed before it made the fixture.
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("a scene's mocks are on before the first app module is evaluated", () => {
    expect(appGlobal.switchedOnScene).toBe(SCENE_ID);
    expect(appGlobal.firstCall).toBe('mocked');
  });

  it('a module that builds a socket class at load sees the held socket', () => {
    expect(Object.getPrototypeOf(appGlobal.ChatSocket)).toBe(HeldSocket);
  });
});
