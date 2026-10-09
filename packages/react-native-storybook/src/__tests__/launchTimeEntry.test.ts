/**
 * Sherlo's withStorybook on Storybook's two setups (metro/withStorybook.js and
 * metro/launchTimeEntry.js), on small fixture projects laid out on disk. Each project carries a
 * stand-in `@storybook/react-native` with both of Storybook's Metro wrappers, each recording the
 * options it is called with. The older wrapper withStorybook.js loads from the SDK's own folder is
 * replaced by its stand-in in Node's module cache, so the real one never runs here.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  createFixtureRoot,
  fixtureFileWriter,
  storybookWrapperStandInSource,
} from './bundle/fixtureMetroConfig';
import { enterBundlingProcess } from './bundlingProcess';

const SDK_METRO_FOLDER = path.resolve(__dirname, '..', '..', 'metro');
const {
  findAppEntry,
  APP_SIDE_REQUEST,
  STORYBOOK_SIDE_REQUEST,
} = require('../../metro/launchTimeEntry');
const { sherloCacheFolder } = require('../../metro/projectPaths');

type WrapperCall = { wrapper: 'older' | 'newer'; options: Record<string, unknown> };
type Resolution = { type: string; filePath?: string };
type ResolveRequest = (
  context: { originModulePath: string; resolveRequest: unknown },
  moduleName: string,
  platform: string | null
) => Resolution;

// Every stand-in wrapper records its calls here (storybookWrapperStandInSource).
const wrapperCalls: WrapperCall[] = [];
(globalThis as { __storybookWrapperCalls?: WrapperCall[] }).__storybookWrapperCalls = wrapperCalls;

const withStorybook: (
  config: object,
  opts: object
) => { resolver: { resolveRequest: ResolveRequest } } = require('../../metro/withStorybook');
let olderWrapperFile: string;
let cachedOlderWrapper: NodeModule | undefined;

beforeAll(() => {
  // withStorybook.js loads Storybook's older wrapper from the SDK's own folder, through Node's
  // module cache: put the stand-in in its place there.
  olderWrapperFile = require.resolve('@storybook/react-native/metro/withStorybook', {
    paths: [SDK_METRO_FOLDER],
  });
  cachedOlderWrapper = require.cache[olderWrapperFile];
  const olderStandIn = { exports: {} as unknown, loaded: true, id: olderWrapperFile };
  const runStandIn = vm.runInThisContext(
    '(function (module, require) {\n' + storybookWrapperStandInSource('older') + '\n})'
  );
  runStandIn(olderStandIn, require);
  require.cache[olderWrapperFile] = olderStandIn as unknown as NodeModule;

  defaultSetupRoot = createStorybookProject(DEFAULT_SETUP_STORYBOOK_ENTRY);
  defaultSetupResolve = wrapConfig(defaultSetupRoot).resolver.resolveRequest;
  // Removed after all the tests, not after the first.
  projectRoots.length = 0;
  wrapperCalls.length = 0;
});

afterAll(() => {
  if (cachedOlderWrapper) require.cache[olderWrapperFile] = cachedOlderWrapper;
  else delete require.cache[olderWrapperFile];
  fs.rmSync(defaultSetupRoot, { recursive: true, force: true });
});

// One project on the default setup, wrapped once, shared by every test that only reads it.
let defaultSetupRoot: string;
let defaultSetupResolve: ResolveRequest;

const DEFAULT_SETUP_STORYBOOK_ENTRY =
  "import { AppRegistry } from 'react-native';\n" +
  "import { view } from './storybook.requires';\n" +
  "AppRegistry.registerComponent('main', () => view.getStorybookUI({}));\n";
const OLD_SETUP_STORYBOOK_ENTRY =
  "import { view } from './storybook.requires';\n" + 'export default view.getStorybookUI({});\n';

// The projects one test makes for itself, removed after it.
const projectRoots: string[] = [];

/** A project on disk with `files` in it, by their path in the project. */
function createProject(files: Record<string, string>): string {
  const root = createFixtureRoot('sherlo-launch-entry-');
  projectRoots.push(root);
  const write = fixtureFileWriter(root);
  for (const [relativePath, content] of Object.entries(files)) write(relativePath, content);
  return root;
}

/** A Storybook project: its app entry `index.js`, a Storybook entry file, and both wrappers. */
function createStorybookProject(storybookEntrySource: string): string {
  return createProject({
    'package.json': JSON.stringify({ name: 'fixture-app' }),
    'index.js': "require('./src/App');\n",
    'src/App.js': 'module.exports = {};\n',
    '.rnstorybook/index.js': storybookEntrySource,
    '.rnstorybook/storybook.requires.ts': 'export const view = {};\n',
    'node_modules/@storybook/react-native/package.json': JSON.stringify({
      name: '@storybook/react-native',
      version: '10.4.0',
    }),
    'node_modules/@storybook/react-native/withStorybook.js': storybookWrapperStandInSource('newer'),
    'node_modules/@storybook/react-native/metro/withStorybook.js':
      storybookWrapperStandInSource('older'),
  });
}

afterEach(() => {
  wrapperCalls.length = 0;
  for (const root of projectRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/** Sherlo's withStorybook on `root`'s config, in a debug bundle with `env` set. */
function wrapConfig(root: string, env: Record<string, string> = {}) {
  const leaveBundlingProcess = enterBundlingProcess(env, []);
  try {
    return withStorybook({ projectRoot: root, resolver: {}, serializer: {}, server: {} }, {});
  } finally {
    leaveBundlingProcess();
  }
}

/**
 * Metro's own resolver, as much of it as a relative request in the fixtures needs. Like Metro, it
 * answers with the file a symlink points to.
 */
function resolveRelativeFile(
  context: { originModulePath: string },
  moduleName: string
): Resolution {
  const basePath = path.resolve(path.dirname(context.originModulePath), moduleName);
  const candidates = ['', '.js', '.ts', '/index.js'].map((ending) => basePath + ending);
  const filePath = candidates.find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  );
  if (!filePath) throw new Error('Unable to resolve ' + moduleName);
  return { type: 'sourceFile', filePath: fs.realpathSync(filePath) };
}

/** Asks `resolveRequest` for `moduleName` from `importer`, as Metro does. */
function resolveFrom(
  resolveRequest: ResolveRequest,
  importer: string,
  moduleName: string,
  platform: string | null = 'ios'
): Resolution {
  return resolveRequest(
    { originModulePath: importer, resolveRequest: resolveRelativeFile },
    moduleName,
    platform
  );
}

/** Metro asks for the bundle's own entry from the folder it bundles, followed by `/.`. */
function bundleEntryRequester(root: string): string {
  return root + '/.';
}

function launchEntryFile(root: string): string {
  return path.join(sherloCacheFolder(root), 'launch-entry.js');
}

describe('the launch-time entry', () => {
  it("the old setup calls Storybook's metro wrapper and leaves the entry alone", () => {
    const root = createStorybookProject(OLD_SETUP_STORYBOOK_ENTRY);

    const config = wrapConfig(root);

    expect(wrapperCalls.map((call) => call.wrapper)).toEqual(['older']);
    expect(fs.existsSync(launchEntryFile(root))).toBe(false);
    const entry = resolveFrom(
      config.resolver.resolveRequest,
      path.join(root, 'src/App.js'),
      '../index'
    );
    expect(entry.filePath).toBe(path.join(root, 'index.js'));
  });

  it("the default setup calls Storybook's own newer wrapper with Storybook turned on", () => {
    const root = defaultSetupRoot;

    wrapConfig(root);

    expect(wrapperCalls).toHaveLength(1);
    expect(wrapperCalls[0].wrapper).toBe('newer');
    expect(wrapperCalls[0].options).toMatchObject({
      enabled: true,
      configPath: path.join(root, '.rnstorybook'),
    });

    // With the build setting off, the newer wrapper is still the one called, turned off.
    wrapperCalls.length = 0;
    wrapConfig(root, { SHERLO_BUILD: 'off' });

    expect(wrapperCalls).toHaveLength(1);
    expect(wrapperCalls[0].wrapper).toBe('newer');
    expect(wrapperCalls[0].options).toMatchObject({ enabled: false });
  });

  it('finds the app entry the way the bundler does, and refuses when there is none', () => {
    const fromMainFile = createProject({
      'package.json': JSON.stringify({ main: 'src/main' }),
      'src/main.tsx': '',
      'index.js': '',
    });
    expect(findAppEntry(fromMainFile)).toBe(path.join(fromMainFile, 'src/main.tsx'));

    const fromMainPackage = createProject({
      'package.json': JSON.stringify({ main: 'expo-router/entry' }),
      'node_modules/expo-router/package.json': JSON.stringify({ name: 'expo-router' }),
      'node_modules/expo-router/entry.js': '',
    });
    expect(findAppEntry(fromMainPackage)).toBe(
      path.join(fromMainPackage, 'node_modules/expo-router/entry.js')
    );

    const fromIndex = createProject({ 'package.json': JSON.stringify({}), 'index.ts': '' });
    expect(findAppEntry(fromIndex)).toBe(path.join(fromIndex, 'index.ts'));

    const noEntryMessage =
      'Sherlo could not find your app\'s entry file. It looked for the "main" field in ' +
      "package.json, then for index.js. Sherlo needs the app's entry to choose between the app " +
      'and Storybook at launch, so add a "main" field that points to it.';
    const withoutEntry = createProject({ 'package.json': JSON.stringify({ main: 'missing' }) });
    expect(() => findAppEntry(withoutEntry)).toThrow(noEntryMessage);

    // On the default setup the bundler stops there, rather than taking the old setup's road.
    const defaultSetupWithoutEntry = createStorybookProject(DEFAULT_SETUP_STORYBOOK_ENTRY);
    fs.rmSync(path.join(defaultSetupWithoutEntry, 'index.js'));
    expect(() => wrapConfig(defaultSetupWithoutEntry)).toThrow(noEntryMessage);
  });

  it("only the bundle's own entry request resolves to the generated launch entry", () => {
    const root = defaultSetupRoot;
    const resolveRequest = defaultSetupResolve;

    const bundleEntry = resolveFrom(resolveRequest, bundleEntryRequester(root), './index');
    expect(bundleEntry).toEqual({ type: 'sourceFile', filePath: launchEntryFile(root) });
    expect(fs.existsSync(launchEntryFile(root))).toBe(true);

    // The app's entry, imported from anywhere else, is the app's entry, though Storybook's
    // wrapper swaps that import for the Storybook entry file too.
    const appEntryImported = resolveFrom(resolveRequest, path.join(root, 'src/App.js'), '../index');
    expect(appEntryImported.filePath).toBe(path.join(root, 'index.js'));

    // The launch entry's two sides are the app's entry and the Storybook entry file.
    expect(resolveFrom(resolveRequest, launchEntryFile(root), APP_SIDE_REQUEST).filePath).toBe(
      path.join(root, 'index.js')
    );
    expect(
      resolveFrom(resolveRequest, launchEntryFile(root), STORYBOOK_SIDE_REQUEST).filePath
    ).toBe(path.join(root, '.rnstorybook/index.js'));
  });

  it('a symlinked app entry still resolves to the generated launch entry', () => {
    // A linked install: the app's index.js is a symlink, and Metro answers with the real file.
    const root = createStorybookProject(DEFAULT_SETUP_STORYBOOK_ENTRY);
    fs.mkdirSync(path.join(root, 'app-source'));
    fs.renameSync(path.join(root, 'index.js'), path.join(root, 'app-source/index.js'));
    fs.symlinkSync(path.join(root, 'app-source/index.js'), path.join(root, 'index.js'));
    const { resolveRequest } = wrapConfig(root).resolver;

    const bundleEntry = resolveFrom(resolveRequest, bundleEntryRequester(root), './index');

    expect(bundleEntry).toEqual({ type: 'sourceFile', filePath: launchEntryFile(root) });
  });

  it('any other import of the Storybook entry file is refused', () => {
    const root = defaultSetupRoot;

    expect(() =>
      resolveFrom(defaultSetupResolve, path.join(root, 'src/App.js'), '../.rnstorybook')
    ).toThrow(
      "src/App.js imports the Storybook entry file. On Storybook's default setup, Sherlo loads " +
        'Storybook itself, so remove that import.'
    );
  });

  it("a web bundle keeps the app's entry", () => {
    const root = defaultSetupRoot;

    const webEntry = resolveFrom(defaultSetupResolve, bundleEntryRequester(root), './index', 'web');

    expect(webEntry).toEqual({ type: 'sourceFile', filePath: path.join(root, 'index.js') });
  });
});
