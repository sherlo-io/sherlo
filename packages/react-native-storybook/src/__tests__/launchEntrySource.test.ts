/**
 * The launch entry Sherlo writes on Storybook's default setup, and for an app with scene files and
 * no Storybook (metro/launchTimeEntry.js): what it
 * requires, and in which order, for each mode the native module can answer. The source is run with
 * a stubbed `require` and a stubbed native module; the open and capture listeners go to the suite's
 * fake core (./__mocks__/fakeSealedCore).
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as vm from 'vm';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeModules } from 'react-native';
import {
  __emitMessageFromTheConnection,
  __getDialedAddresses,
  __getSentMessages,
  __getWrapperComponentProvider,
  __resetWrapperComponentProvider,
  __resetConnection,
} from './__mocks__/react-native';
import { __resetForTests as resetTheLine, startTheLine } from '../connection/appLine';
import { currentAppFiber } from '../componentNames';
import { startWaitingAsTheApp } from '../openStoryChannel';
import * as storyOfTheApp from '../storyOfTheApp';
import { getSealedCore } from '../sealedCore/loadSealedCore';
import type { SherloLine } from '../../metro/sherloLine';
import type { FakeSealedCore } from './__mocks__/fakeSealedCore';

/**
 * Renders an app root inside the wrapper React Native was given, for real: no mock of its-fine or
 * of React's hooks, and no provider of the test's own around it. A host element stands for the
 * app's views.
 */
function renderTheAppInItsWrapper() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const Wrapper = __getWrapperComponentProvider()?.() as ComponentType<{ children: ReactNode }>;
  const theAppsViews = createElement('View', { testID: 'root' });
  let rendered!: ReturnType<typeof create>;
  act(() => {
    rendered = create(createElement(Wrapper, null, theAppsViews));
  });
  return { rendered, theAppsViews };
}

const {
  launchEntrySource,
  APP_SIDE_REQUEST,
  STORYBOOK_SIDE_REQUEST,
} = require('../../metro/launchTimeEntry');
const { attach, LINE_PATH, PROTOCOL_VERSION } = require('../../metro/sherloLine.js');
const ws = require('ws');

// The bundle holds the scene these captures ask for, as Sherlo's bundler writes its list.
vi.mock('../bundledScenes', () => ({
  default: {
    'inbox--full': { filePath: './src/inbox.scenes.tsx', sceneName: 'Full', loadFile: () => ({}) },
  },
}));

type Mode = 'default' | 'storybook' | 'testing';
type SherloBuild = 'storybook' | 'app-and-storybook';

/**
 * Runs the launch entry of a build carrying `sherloBuild`, in an app the native module says is in
 * `mode`; `hasStorybook` false is an app with scene files and no Storybook. Loading the SDK starts
 * its line, as its index does. Returns what happened, in order.
 */
function launch(sherloBuild: SherloBuild, mode: Mode, hasStorybook?: boolean): string[] {
  const happened: string[] = [];
  const modules: Record<string, () => unknown> = {
    '@sherlo/react-native-storybook': () => {
      happened.push('the SDK');
      startTheLine();
      return {};
    },
    '@sherlo/react-native-storybook/dist/SherloModule.js': () => ({
      default: {
        getMode: () => {
          happened.push('the mode');
          return mode;
        },
      },
    }),
    '@sherlo/react-native-storybook/dist/addStorybookToDevMenu.js': () => ({
      default: () => happened.push('the developer menu item'),
    }),
    '@sherlo/react-native-storybook/dist/openStoryChannel.js': () => ({
      startWaitingAsTheApp: () => {
        happened.push('the open and capture listeners');
        startWaitingAsTheApp();
      },
    }),
    '@sherlo/react-native-storybook/dist/storyOfTheApp.js': () => ({
      wrapTheAppInStoryOfTheApp: () => {
        happened.push('the app wrapped');
        storyOfTheApp.wrapTheAppInStoryOfTheApp();
      },
    }),
    [STORYBOOK_SIDE_REQUEST]: () => {
      happened.push('the Storybook side');
      return {};
    },
    [APP_SIDE_REQUEST]: () => {
      happened.push('the app side');
      return {};
    },
  };

  function stubbedRequire(moduleName: string): unknown {
    const loadModule = modules[moduleName];
    if (!loadModule) {
      throw new Error('The launch entry required an unexpected module: ' + moduleName);
    }
    return loadModule();
  }

  const runLaunchEntry = vm.runInThisContext(
    '(function (require) {\n' + launchEntrySource(sherloBuild, hasStorybook) + '\n})'
  );
  runLaunchEntry(stubbedRequire);
  return happened;
}

function fakeCore(): FakeSealedCore {
  return getSealedCore() as FakeSealedCore;
}

/**
 * A bundler's line on loopback with the app on it: a socket that says hello and stands in for the
 * app's native connection, so what the line says to the app reaches the SDK, and the SDK's
 * messages are carried to the line one at a time.
 */
async function aBundlersLineWithTheAppOnIt() {
  const server = http.createServer();
  const line: SherloLine = attach(server, ws.WebSocketServer || ws.Server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const heardWaiters: Array<() => void> = [];
  const appIsOnTheLine = new Promise<void>((resolve) =>
    line.onApp((app) => {
      app.onMessage(() => heardWaiters.splice(0).forEach((heard) => heard()));
      resolve();
    })
  );

  const port = (server.address() as AddressInfo).port;
  const socket = new ws(`ws://127.0.0.1:${port}${LINE_PATH}`);
  await new Promise((resolve) => socket.once('open', resolve));
  socket.on('message', (data: unknown) => __emitMessageFromTheConnection(JSON.parse(String(data))));
  const hello = { protocolVersion: PROTOCOL_VERSION, nativeVersion: '3.0.0', jsVersion: '3.0.0' };

  /** Send one message to the line as the app, and resolve once the line has heard it. */
  function sayAsTheApp(message: Record<string, unknown>): Promise<void> {
    const heard = new Promise<void>((resolve) => heardWaiters.push(resolve));
    socket.send(JSON.stringify(message));
    return heard;
  }
  socket.send(JSON.stringify({ action: 'hello', ...hello }));
  await appIsOnTheLine;

  return {
    ask: line.ask,
    /** Carry the SDK's latest message to the line, as native code does. */
    carryTheAppsLatestMessage: () => sayAsTheApp(__getSentMessages().slice(-1)[0]),
    close: () => {
      socket.terminate();
      server.close();
    },
  };
}

beforeEach(() => {
  fakeCore().calls.length = 0;
  __resetConnection();
  __resetWrapperComponentProvider();
  resetTheLine();
  NativeModules.SourceCode = {
    getConstants: () => ({ scriptURL: 'http://localhost:8081/index.bundle?platform=ios' }),
  };
});

afterEach(() => {
  delete NativeModules.SourceCode;
});

describe('the generated launch entry', () => {
  it('the launch entry loads the SDK before either side', () => {
    const launches: [SherloBuild, Mode][] = [
      ['app-and-storybook', 'default'],
      ['app-and-storybook', 'storybook'],
      ['app-and-storybook', 'testing'],
      ['storybook', 'default'],
      ['storybook', 'testing'],
    ];

    for (const [sherloBuild, mode] of launches) {
      expect(launch(sherloBuild, mode)[0]).toBe('the SDK');
    }
  });

  it('the launch entry requires the Storybook side in Storybook and testing mode', () => {
    expect(launch('app-and-storybook', 'storybook')).toEqual([
      'the SDK',
      'the mode',
      'the Storybook side',
    ]);
    expect(launch('app-and-storybook', 'testing')).toEqual([
      'the SDK',
      'the mode',
      'the Storybook side',
    ]);

    // A build carrying Storybook alone never reaches the app side, whatever the mode.
    expect(launch('storybook', 'default')).toEqual(['the SDK', 'the Storybook side']);
    expect(launchEntrySource('storybook')).not.toContain(APP_SIDE_REQUEST);
  });

  it('the launch entry starts the open and capture listeners in default mode', () => {
    expect(launch('app-and-storybook', 'default')).toEqual([
      'the SDK',
      'the mode',
      'the developer menu item',
      'the open and capture listeners',
      'the app side',
    ]);

    const handedToTheCore = fakeCore().calls.filter(
      (call) => call.method === 'startWaitingAsTheApp'
    );
    expect(handedToTheCore).toHaveLength(1);
    const { letterbox, capture } = handedToTheCore[0].args[0] as {
      letterbox: { waitForStory: unknown };
      capture: { waitForACapture: unknown };
    };
    expect(typeof letterbox.waitForStory).toBe('function');
    expect(typeof capture.waitForACapture).toBe('function');

    // A built app has no bundler beside it, so nothing starts.
    fakeCore().calls.length = 0;
    delete NativeModules.SourceCode;
    launch('app-and-storybook', 'default');
    expect(fakeCore().calls.filter((call) => call.method === 'startWaitingAsTheApp')).toEqual([]);
  });

  it("a scenes-only app says hello on the bundler's line and waits for a capture", async () => {
    expect(launch('app-and-storybook', 'default', false)).toEqual([
      'the SDK',
      'the app wrapped',
      'the open and capture listeners',
      'the app side',
    ]);

    expect(__getSentMessages()[0]).toMatchObject({ action: 'hello' });
    expect(__getDialedAddresses()).toEqual(['ws://localhost:8081/sherlo/line']);

    const handedToTheCore = fakeCore().calls.filter(
      (call) => call.method === 'startWaitingAsTheApp'
    );
    expect(handedToTheCore).toHaveLength(1);
    const { capture } = handedToTheCore[0].args[0] as {
      capture: { waitForACapture: (saying: unknown) => Promise<unknown> };
    };
    const saying = { mode: 'default', stories: ['chat--conversation'], answer: null };
    const instruction = capture.waitForACapture(saying);
    expect(__getSentMessages()).toContainEqual({
      action: 'waitForACapture',
      scenes: ['inbox--full'],
      ...saying,
    });
    __emitMessageFromTheConnection({ action: 'captureInstruction', storyId: 'chat--conversation' });
    await expect(instruction).resolves.toEqual({ storyId: 'chat--conversation' });

    // It has no Storybook side to reach.
    expect(launchEntrySource('app-and-storybook', false)).not.toContain(STORYBOOK_SIDE_REQUEST);
  });

  it("a scenes-only app's wrapped root renders with no provider of the app's own around it", () => {
    launch('app-and-storybook', 'testing', false);

    // A provider the wrapper lacks throws here, as it did on the phone.
    const { rendered, theAppsViews } = renderTheAppInItsWrapper();
    expect(rendered.toJSON()).toEqual({ type: 'View', props: { testID: 'root' }, children: null });
    expect(currentAppFiber()?.child?.memoizedProps).toBe(theAppsViews.props);
    act(() => rendered.unmount());
  });

  it("a scenes-only app's own root is remembered as the app the play steps walk", () => {
    expect(launch('app-and-storybook', 'testing', false).slice(0, 3)).toEqual([
      'the SDK',
      'the app wrapped',
      'the open and capture listeners',
    ]);

    // The app's root renders inside the wrapper React Native was given, before its entry runs.
    expect(currentAppFiber()).toBeUndefined();
    const { rendered } = renderTheAppInItsWrapper();
    expect(currentAppFiber()?.child?.type).toBe('View');
    act(() => rendered.unmount());
    expect(currentAppFiber()).toBeUndefined();

    // The Storybook roads set no wrapper: their decorator renders it.
    __resetWrapperComponentProvider();
    launch('app-and-storybook', 'testing');
    expect(__getWrapperComponentProvider()).toBeUndefined();
  });

  it("a scenes-only app launched by a capture waits for that capture on the bundler's line", () => {
    // A capture moves the app into testing mode on the scene, its JavaScript still the bundler's.
    expect(launch('app-and-storybook', 'testing', false)).toContain(
      'the open and capture listeners'
    );
    expect(__getDialedAddresses()).toEqual(['ws://localhost:8081/sherlo/line']);
    expect(fakeCore().calls.filter((call) => call.method === 'startWaitingAsTheApp')).toHaveLength(
      1
    );

    // A runner's launch of a scene runs JavaScript from the device, with no bundler beside it:
    // nothing waits there, and its session is the early-boot module's (src/sceneBoot.ts).
    fakeCore().calls.length = 0;
    delete NativeModules.SourceCode;
    launch('app-and-storybook', 'testing', false);
    expect(fakeCore().calls.filter((call) => call.method === 'startWaitingAsTheApp')).toEqual([]);
  });

  it("a scenes-only app launched for a capture answers the capture on the bundler's line", async () => {
    // The capture launched the app in testing mode on its scene, its JavaScript the bundler's.
    launch('app-and-storybook', 'testing', false);
    const handedToTheCore = fakeCore().calls.filter(
      (call) => call.method === 'startWaitingAsTheApp'
    );
    const { capture } = handedToTheCore[0].args[0] as {
      capture: { waitForACapture: (saying: unknown) => Promise<unknown> };
    };
    const settings = { requiredMatches: 3, minScreenshotsCount: 6, intervalMs: 500 };
    const line = await aBundlersLineWithTheAppOnIt();

    try {
      // The core waits on the line; with no Storybook it cannot list stories.
      const instruction = capture.waitForACapture({ mode: 'testing', stories: null, answer: null });
      await line.carryTheAppsLatestMessage();

      // `sherlo capture --scene` asks for the scene as a scene (packages/cli/src/seams/liveScene.ts),
      // and the core is handed it as one: the field its scene walk reads, with no Storybook.
      const reply = line.ask({ action: 'captureStory', sceneId: 'inbox--full', settings });
      await expect(instruction).resolves.toEqual({ sceneId: 'inbox--full', settings });

      // The core's next wait carries the scene's record, and the line hands it to the CLI.
      const recorded = { kind: 'captured', sceneId: 'inbox--full' };
      void capture
        .waitForACapture({ mode: 'testing', stories: null, answer: recorded })
        .catch(() => undefined);
      await line.carryTheAppsLatestMessage();
      await expect(reply).resolves.toEqual(recorded);
    } finally {
      line.close();
    }
  });
});
