/**
 * Sherlo's withStorybook on Storybook's two setups (metro/withStorybook.js and
 * metro/launchTimeEntry.js), on small fixture projects laid out on disk. Each project carries a
 * stand-in `@storybook/react-native` with both of Storybook's Metro wrappers, each recording the
 * options it is called with. The older wrapper withStorybook.js loads from the SDK's own folder is
 * replaced by its stand-in in Node's module cache, so the real one never runs here.
 */
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
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
  CODE_STAMP_GLOBAL,
  launchEntrySource,
} = require('../../metro/launchTimeEntry');
const { BUNDLER_STAMP, LINE_PATH, PROTOCOL_VERSION } = require('../../metro/sherloLine');
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

/**
 * A Storybook project: its app entry `index.js`, a Storybook entry file, both wrappers, and
 * `moreFiles`.
 */
function createStorybookProject(
  storybookEntrySource: string,
  moreFiles: Record<string, string> = {}
): string {
  return createProject({
    ...moreFiles,
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

/**
 * Sherlo's withStorybook on `root`'s config, with `env` set and `commandLine` after the CLI's
 * script (a debug bundle when it says nothing), `resolver` as the config's own, and `options` as
 * the options the app gives withStorybook.
 */
function wrapConfig(
  root: string,
  env: Record<string, string> = {},
  {
    resolver = {},
    commandLine = [],
    options = {},
  }: { resolver?: object; commandLine?: string[]; options?: object } = {}
) {
  const leaveBundlingProcess = enterBundlingProcess(env, commandLine);
  try {
    return withStorybook({ projectRoot: root, resolver, serializer: {}, server: {} }, options);
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

  it("the app's entry is the first index file in the bundler's own extension order, so an index.ts wins over an index.js shim", () => {
    // No main field, and an index.js that only imports index.ts: the bundler, TypeScript first as
    // Expo's is, serves index.ts for the bundle's entry.
    const root = createStorybookProject(DEFAULT_SETUP_STORYBOOK_ENTRY);
    const write = fixtureFileWriter(root);
    write('index.js', "import './index.ts';\n");
    write('index.ts', "require('./src/App');\n");
    const sourceExts = ['ts', 'tsx', 'js', 'jsx', 'json', 'svg'];
    function resolveTypeScriptFirst(context: { originModulePath: string }, moduleName: string) {
      const basePath = path.resolve(path.dirname(context.originModulePath), moduleName);
      const filePath = sourceExts
        .map((extension) => basePath + '.' + extension)
        .find((candidate) => fs.existsSync(candidate));
      if (!filePath) throw new Error('Unable to resolve ' + moduleName);
      return { type: 'sourceFile', filePath };
    }

    const { resolveRequest } = wrapConfig(root, {}, { resolver: { sourceExts } }).resolver;

    expect(findAppEntry(root, sourceExts)).toBe(path.join(root, 'index.ts'));
    const bundleEntry = resolveRequest(
      { originModulePath: bundleEntryRequester(root), resolveRequest: resolveTypeScriptFirst },
      './index',
      'ios'
    );
    expect(bundleEntry).toEqual({ type: 'sourceFile', filePath: launchEntryFile(root) });
    expect(
      resolveRequest(
        { originModulePath: launchEntryFile(root), resolveRequest: resolveTypeScriptFirst },
        APP_SIDE_REQUEST,
        'ios'
      ).filePath
    ).toBe(path.join(root, 'index.ts'));

    // A bundler that names no order looks JavaScript first, as Storybook's own entry swap does.
    expect(findAppEntry(root)).toBe(path.join(root, 'index.js'));
  });

  it("on Storybook's old setup the debug bundle still carries the code stamp", () => {
    const root = createStorybookProject(OLD_SETUP_STORYBOOK_ENTRY);
    type WithPolyfills = { serializer: { getPolyfills?: (ctx: object) => string[] } };
    // The old setup has no launch entry: every polyfill the bundle runs first is read for the stamp.
    function stampOfTheBundle(config: WithPolyfills): unknown {
      const sandbox: Record<string, unknown> = {};
      for (const polyfill of config.serializer.getPolyfills?.({}) ?? []) {
        const source = fs.readFileSync(polyfill, 'utf8');
        if (!source.includes(CODE_STAMP_GLOBAL)) continue;
        vm.runInNewContext(source.replace('globalThis', 'sandbox'), { sandbox });
      }
      return sandbox[CODE_STAMP_GLOBAL];
    }

    expect(stampOfTheBundle(wrapConfig(root) as unknown as WithPolyfills)).toBe(BUNDLER_STAMP);

    // A release bundle that carries Sherlo carries no stamp, so two bundles of the same code are
    // the same.
    const release = wrapConfig(
      root,
      { SHERLO_BUILD: 'app-and-storybook' },
      { commandLine: ['--dev', 'false'], options: { configPath: path.join(root, '.rnstorybook') } }
    );
    expect(release.resolver.resolveRequest).toBeTypeOf('function');
    expect(stampOfTheBundle(release as unknown as WithPolyfills)).toBeUndefined();
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

  it('the served code carries the stamp of the bundler that served it', () => {
    const root = defaultSetupRoot;
    const served = fs.readFileSync(launchEntryFile(root), 'utf8');

    // The launch entry sets the global the app reads its stamp from, before anything else runs.
    const sandbox: Record<string, unknown> = {};
    vm.runInNewContext(
      served
        .split("require('@sherlo/react-native-storybook');")[0]
        .replace('globalThis', 'sandbox'),
      { sandbox }
    );
    expect(sandbox[CODE_STAMP_GLOBAL]).toBe(BUNDLER_STAMP);

    // Code built into an app is made with no stamp.
    expect(launchEntrySource('app-and-storybook', true)).not.toContain(CODE_STAMP_GLOBAL);
  });

  it("a release bundle's entry carries no bundler stamp and is the same on every bundler start", () => {
    const root = createStorybookProject(DEFAULT_SETUP_STORYBOOK_ENTRY);

    // A release bundle asks for its entry with `dev` false.
    function releaseEntryServed(resolveRequest: ResolveRequest): string {
      const entry = resolveRequest(
        {
          originModulePath: bundleEntryRequester(root),
          resolveRequest: resolveRelativeFile,
          dev: false,
        } as Parameters<ResolveRequest>[0],
        './index',
        'ios'
      );
      return fs.readFileSync(entry.filePath as string, 'utf8');
    }

    const first = releaseEntryServed(wrapConfig(root).resolver.resolveRequest);
    expect(first).not.toContain(CODE_STAMP_GLOBAL);

    // A bundler started again makes a new stamp; the release entry does not change.
    const metroFolder = SDK_METRO_FOLDER + path.sep;
    const loadedBefore = Object.entries(require.cache).filter(([file]) =>
      file.startsWith(metroFolder)
    );
    for (const [file] of loadedBefore) delete require.cache[file];
    const leaveBundlingProcess = enterBundlingProcess({}, []);
    try {
      expect(require('../../metro/sherloLine').BUNDLER_STAMP).not.toBe(BUNDLER_STAMP);
      const freshWithStorybook = require('../../metro/withStorybook');
      const second = releaseEntryServed(
        freshWithStorybook({ projectRoot: root, resolver: {}, serializer: {}, server: {} }, {})
          .resolver.resolveRequest
      );
      expect(second).toBe(first);
    } finally {
      leaveBundlingProcess();
      // Put the modules the other tests hold back in the cache.
      for (const [file] of Object.entries(require.cache)) {
        if (file.startsWith(metroFolder)) delete require.cache[file];
      }
      for (const [file, loaded] of loadedBefore) require.cache[file] = loaded;
    }
  });

  it("the release launch entry's own side requests resolve", () => {
    const root = createStorybookProject(DEFAULT_SETUP_STORYBOOK_ENTRY);
    const { resolveRequest } = wrapConfig(root).resolver;
    const releaseEntryFile = path.join(sherloCacheFolder(root), 'launch-entry-release.js');
    const ask = (moduleName: string) =>
      resolveRequest(
        {
          originModulePath: releaseEntryFile,
          resolveRequest: resolveRelativeFile,
          dev: false,
        } as Parameters<ResolveRequest>[0],
        moduleName,
        'ios'
      );

    expect(ask(STORYBOOK_SIDE_REQUEST).filePath).toBe(path.join(root, '.rnstorybook/index.js'));
    expect(ask(APP_SIDE_REQUEST).filePath).toContain('app-entry-original');
  });

  it("in a release bundle the app's entry imported from the Storybook entry is the copy, not the launch entry served in its place", () => {
    const root = defaultSetupRoot;
    const storybookEntryFile = path.join(root, '.rnstorybook/index.js');
    const ask = (dev: boolean, platform: string) =>
      defaultSetupResolve(
        {
          originModulePath: storybookEntryFile,
          resolveRequest: resolveRelativeFile,
          dev,
        } as Parameters<ResolveRequest>[0],
        '../index',
        platform
      );

    expect(ask(false, 'ios').filePath).toContain('app-entry-original');
    expect(ask(true, 'ios').filePath).toBe(path.join(root, 'index.js'));
    expect(ask(false, 'web').filePath).toBe(path.join(root, 'index.js'));
  });

  it("a web bundle keeps the app's entry", () => {
    const root = defaultSetupRoot;

    const webEntry = resolveFrom(defaultSetupResolve, bundleEntryRequester(root), './index', 'web');

    expect(webEntry).toEqual({ type: 'sourceFile', filePath: path.join(root, 'index.js') });
  });
});

type LineMessage = Record<string, any>;

/** A socket on the bundler's line, every message it is sent, and a question answered on it. */
async function socketOnTheLine(origin: string) {
  const ws = require('ws');
  const socket = new ws(`ws://${origin}${LINE_PATH}`);
  await new Promise((resolve) => socket.once('open', resolve));
  const received: LineMessage[] = [];
  const waiters: Array<{
    matches: (m: LineMessage) => boolean;
    resolve: (m: LineMessage) => void;
  }> = [];
  socket.on('message', (data: unknown) => {
    const message = JSON.parse(String(data));
    received.push(message);
    const index = waiters.findIndex((waiter) => waiter.matches(message));
    if (index !== -1) waiters.splice(index, 1)[0].resolve(message);
  });
  let asked = 0;
  return {
    received,
    close: () => socket.terminate(),
    send: (message: LineMessage) => socket.send(JSON.stringify(message)),
    /** The next message sent to this socket that matches, once it arrives. */
    next: (matches: (m: LineMessage) => boolean) =>
      new Promise<LineMessage>((resolve) => waiters.push({ matches, resolve })),
    /** A question, and its reply. Asked by the app's own socket, it lands after all the app said. */
    ask(question: LineMessage): Promise<LineMessage> {
      asked += 1;
      const askId = String(asked);
      const reply = new Promise<LineMessage>((resolve) =>
        waiters.push({ matches: (m) => m.action === 'reply' && m.askId === askId, resolve })
      );
      socket.send(JSON.stringify({ ...question, askId }));
      return reply.then((m) => m.reply);
    },
  };
}

describe('a scene left open on the bundler', () => {
  it('an edit to a file the open scene draws reaches the scene without leaving it', async () => {
    const SCENE = 'inbox--full';
    const SETTINGS = { requiredMatches: 3, timeoutMs: 20000 };
    // The project's Metro, whose `ws` the line mounts with, as in a real project.
    const root = createStorybookProject(DEFAULT_SETUP_STORYBOOK_ENTRY, {
      'node_modules/metro/package.json': JSON.stringify({ name: 'metro', version: '0.83.0' }),
      'node_modules/ws/index.js': `module.exports = require(${JSON.stringify(require.resolve('ws'))});\n`,
      'src/Inbox.js': "module.exports = 'Inbox';\n",
    });
    const config = wrapConfig(root) as unknown as {
      server: { enhanceMiddleware: (middleware: unknown, metroServer: unknown) => any };
    };
    // Metro's server, as far as the line reaches into it: the file watcher its graph rebuilds from.
    const watcher = new EventEmitter();
    const metroServer = {
      getBundler: () => ({ getBundler: () => ({ getWatcher: () => watcher }) }),
    };
    const bundler = http.createServer(
      config.server.enhanceMiddleware(
        (_request: unknown, response: http.ServerResponse) => response.end('the bundle'),
        metroServer
      )
    );
    await new Promise<void>((resolve) => bundler.listen(0, '127.0.0.1', resolve));
    const origin = `127.0.0.1:${(bundler.address() as AddressInfo).port}`;
    const sockets: Array<{ close: () => void }> = [];

    try {
      // The first request mounts the line.
      await fetch(`http://${origin}${LINE_PATH}`);

      // The app, booted on the scene in testing mode, waits for its capture.
      const app = await socketOnTheLine(origin);
      sockets.push(app);
      app.send({
        action: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        nativeVersion: '3.0.0',
        jsVersion: '3.0.0',
      });
      const waits = (answer: LineMessage | null) =>
        app.send({
          action: 'waitForACapture',
          mode: 'testing',
          stories: null,
          scenes: [SCENE],
          codeStamp: BUNDLER_STAMP,
          answer,
        });
      const nextInstruction = () => app.next((m) => m.action === 'captureInstruction');
      waits(null);
      await app.ask({ action: 'whatIsOnScreen' });

      // `sherlo open --scene` captures the scene, then lets go of the line.
      const driver = await socketOnTheLine(origin);
      sockets.push(driver);
      const handed = nextInstruction();
      const captured = driver.ask({ action: 'captureStory', sceneId: SCENE, settings: SETTINGS });
      expect(await handed).toEqual({
        action: 'captureInstruction',
        sceneId: SCENE,
        settings: SETTINGS,
      });
      const comeBack = nextInstruction();
      waits({ kind: 'scene', sceneId: SCENE });
      expect(await captured).toEqual({ kind: 'scene', sceneId: SCENE });
      expect(await comeBack).toEqual({ action: 'captureInstruction' });
      driver.close();
      waits(null);
      await app.ask({ action: 'whatIsOnScreen' });

      // Sherlo's own writes under node_modules are no edit; the app's screen file is.
      const reload = app.next((m) => m.action === 'reload-after-edit');
      watcher.emit('change', {
        eventsQueue: [{ filePath: path.join(sherloCacheFolder(root), 'scenes.json') }],
      });
      watcher.emit('change', { eventsQueue: [{ filePath: path.join(root, 'src/Inbox.js') }] });
      watcher.emit('change', { eventsQueue: [{ filePath: path.join(root, 'src/Inbox.js') }] });
      expect(await reload).toEqual({ action: 'reload-after-edit', sceneId: SCENE });

      // The JavaScript starts again on the same connection, booted on the scene, and is handed the
      // same scene to walk: the phone shows the edit, still on the scene.
      const handedAgain = nextInstruction();
      app.send({ action: 'JS_EVAL_COMPLETE' });
      waits(null);
      expect(await handedAgain).toEqual({
        action: 'captureInstruction',
        sceneId: SCENE,
        settings: SETTINGS,
      });
      expect(app.received.filter((m) => m.action === 'reload-after-edit')).toHaveLength(1);
    } finally {
      sockets.forEach((socket) => socket.close());
      bundler.close();
    }
  });
});
