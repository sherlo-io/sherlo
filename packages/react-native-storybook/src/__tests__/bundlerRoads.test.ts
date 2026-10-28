/**
 * THE SDK'S TWO ROADS TO THE BUNDLER - `sherlo capture`'s and `sherlo open`'s - and how they reach
 * the sealed core.
 *
 * The walk of a capture and the letterbox's collect loop are the core's, and tested where the core
 * is built. What stays open in the SDK is the road itself: the wait the app sends over its
 * connection, the answer it takes back (metro/sherloLine.js gives both, sherloLine.test.ts holds
 * it), and the door that hands the road to the core. Native code is the react-native stub, which
 * keeps what the JavaScript sends and plays what the connection brings; the core is the suite's
 * fake (./__mocks__/fakeSealedCore), which records what it is handed.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeModules } from 'react-native';
import {
  __emitMessageFromTheConnection,
  __getDialedAddresses,
  __getSentMessages,
  __resetConnection,
} from './__mocks__/react-native';
import { bundlerCapture, startCaptureTransport, stopCaptureTransport } from '../captureTransport';
import { __resetForTests as __resetTheLine, startTheLine } from '../connection/appLine';
import { enterBundlingProcess } from './bundlingProcess';
import { BUNDLER_LINE_PATH } from '../constants';
import { bundlerLetterbox, startOpenStoryChannel, stopOpenStoryChannel } from '../openStoryChannel';
import { getSealedCore } from '../sealedCore/loadSealedCore';
import type { FakeSealedCore } from './__mocks__/fakeSealedCore';

const withStorybook = require('../../metro/withStorybook');

/** A project root with the SDK folder an installed Sherlo leaves in node_modules. */
function mkSdkProject(prefix: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"app"}\n');
  const sdk = path.join(root, 'node_modules/@sherlo/react-native-storybook');
  fs.mkdirSync(path.join(sdk, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(sdk, 'package.json'), '{"name":"@sherlo/react-native-storybook"}\n');
  fs.writeFileSync(path.join(sdk, 'dist/sceneBoot.js'), '');
  fs.writeFileSync(path.join(sdk, 'dist/bundledScenes.js'), '');
  return root;
}

/** What the SDK handed the fake core's `method`, the last time it called it. */
function lastHandedTo(method: 'startCaptureTransport' | 'startOpenStoryChannel'): unknown {
  const fakeCore = getSealedCore() as FakeSealedCore;
  const callsOfTheMethod = fakeCore.calls.filter((call) => call.method === method);
  return callsOfTheMethod[callsOfTheMethod.length - 1]?.args[0];
}

const ORIGIN = 'http://localhost:8081';
const STORY = 'components-button--primary';

/** A Storybook channel, as much of it as the core's two loops use. */
function makeChannel() {
  return { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
}

const view = { _storyIndex: { entries: { [STORY]: {} } } } as never;

beforeEach(() => {
  (getSealedCore() as FakeSealedCore).calls.length = 0;
  __resetConnection();
  NativeModules.SourceCode = {
    getConstants: () => ({ scriptURL: `${ORIGIN}/index.bundle?platform=ios` }),
  };
});

afterEach(() => {
  stopCaptureTransport();
  stopOpenStoryChannel();
  delete NativeModules.SourceCode;
  vi.useRealTimers();
});

describe("the SDK's road to the bundler's capture relay", () => {
  it("waits for a capture over the connection, saying what the app says, and resolves with the relay's answer", async () => {
    const saying = { mode: 'testing', stories: [STORY], answer: null };

    const instruction = bundlerCapture()!.waitForACapture(saying);

    // With it go the scenes the bundle holds: none in a bundle made without Sherlo's bundler config.
    expect(__getSentMessages()).toEqual([{ action: 'waitForACapture', scenes: [], ...saying }]);
    // Another message the connection brings is not the answer.
    __emitMessageFromTheConnection({ action: 'letterboxAnswer', storyId: 'not-for-the-capture' });
    __emitMessageFromTheConnection({ action: 'captureInstruction', storyId: STORY });
    await expect(instruction).resolves.toEqual({ storyId: STORY });
  });

  it('gives up when the connection brings no answer in time: the road itself is gone', async () => {
    vi.useFakeTimers();

    const instruction = bundlerCapture()!.waitForACapture({
      mode: 'testing',
      stories: [STORY],
      answer: null,
    });
    vi.advanceTimersByTime(25000);

    await expect(instruction).rejects.toThrow(
      "Sherlo's line brought no captureInstruction within 25000ms"
    );
  });

  it('is handed to the core with the channel, and never the view', () => {
    const capture = { waitForACapture: vi.fn() };
    const channel = makeChannel();

    startCaptureTransport({ channel, capture });

    expect(lastHandedTo('startCaptureTransport')).toEqual({ channel, capture });
  });

  it("is the bundler's own road when the SDK is handed none", () => {
    startCaptureTransport({ channel: makeChannel() });

    const { capture } = lastHandedTo('startCaptureTransport') as {
      capture: { waitForACapture: unknown };
    };
    expect(typeof capture.waitForACapture).toBe('function');
  });

  it('is not there for an app whose JavaScript came from a file, so no capture starts', () => {
    delete NativeModules.SourceCode;

    expect(bundlerCapture()).toBeNull();
    startCaptureTransport({ channel: makeChannel() });

    expect(lastHandedTo('startCaptureTransport')).toBeUndefined();
  });
});

describe("the SDK's road to the bundler's letterbox", () => {
  it("waits for a story over the connection, saying what the app says, and resolves with the letterbox's answer", async () => {
    const saying = { stories: [STORY], showing: null, atTheStoryBrowser: true, threw: null };

    const answer = bundlerLetterbox()!.waitForStory(saying);

    expect(__getSentMessages()).toEqual([{ action: 'waitForStory', ...saying }]);
    __emitMessageFromTheConnection({
      action: 'captureInstruction',
      storyId: 'not-for-the-letterbox',
    });
    __emitMessageFromTheConnection({ action: 'letterboxAnswer', storyId: STORY });
    await expect(answer).resolves.toEqual({ storyId: STORY });
  });

  it('is handed to the core with the channel and where the app stands, and never the view', () => {
    const letterbox = { waitForStory: vi.fn() };
    const channel = makeChannel();
    // A Storybook already showing a story: the letterbox opens once it is (openStoryChannel.test.ts).
    const storybookShowingAStory = {
      ...view,
      _preview: { currentSelection: { storyId: STORY } },
    } as never;

    startOpenStoryChannel({
      view: storybookShowingAStory,
      channel,
      atTheStoryBrowser: true,
      letterbox,
    });

    expect(lastHandedTo('startOpenStoryChannel')).toEqual({
      channel,
      atTheStoryBrowser: true,
      letterbox,
    });
  });

  it('is not there for an app whose JavaScript came from a file, so `sherlo open` starts nothing', () => {
    delete NativeModules.SourceCode;

    expect(bundlerLetterbox()).toBeNull();
    startOpenStoryChannel({ view, channel: makeChannel(), atTheStoryBrowser: true });

    expect(lastHandedTo('startOpenStoryChannel')).toBeUndefined();
  });
});

describe("the bundler's address on the road of an app with scene files and no Storybook", () => {
  it("a scenes-only bundle carries the bundler's address the app dials", () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-scenes-only-')));
    fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = 1;\n');
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src/Chat.scenes.js'), 'export default { scenes: {} };\n');

    let config;
    try {
      config = withStorybook({ projectRoot: root, resolver: {}, serializer: {} }, {});
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }

    // The bundler answers at the line's address, on the road no Storybook wrapper is loaded on.
    const answered: { status?: number; body?: string } = {};
    const response = {
      writeHead: (status: number) => (answered.status = status),
      end: (body: string) => (answered.body = body),
    };
    const passedOn = vi.fn();
    const middleware = config.server.enhanceMiddleware(passedOn, {});
    middleware({ url: `${BUNDLER_LINE_PATH}?platform=android`, socket: {} }, response, vi.fn());

    expect(passedOn).not.toHaveBeenCalled();
    expect(answered.status).toBe(200);
    expect(JSON.parse(answered.body!)).toEqual({ protocolVersion: expect.any(Number) });

    // And the SDK the bundle loads dials that same address on the bundler it came from.
    __resetTheLine();
    startTheLine();
    expect(__getDialedAddresses()).toEqual([`ws://localhost:8081${BUNDLER_LINE_PATH}`]);
  });
});

describe('the road of an app with no Storybook and no scene file yet', () => {
  it('an app with no Storybook and no scene file yet bundles on the scenes-only road', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-no-scenes-yet-')));
    fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"app"}\n');

    let config;
    try {
      config = withStorybook({ projectRoot: root, resolver: {}, serializer: {} }, {});
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }

    // Sherlo's transforms and launch entry are on, and no Storybook wrapper was asked for.
    expect(typeof config.resolver.resolveRequest).toBe('function');
    expect(typeof config.server.enhanceMiddleware).toBe('function');
  });

  it('an app with Storybook installed but no Storybook folder and no scene file bundles on the scenes-only road', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-npm-no-folder-')));
    fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"app"}\n');
    // What npm 7+ installs for the SDK's peer.
    const storybook = path.join(root, 'node_modules/@storybook/react-native');
    fs.mkdirSync(storybook, { recursive: true });
    fs.writeFileSync(path.join(storybook, 'package.json'), '{"name":"@storybook/react-native"}\n');

    let config;
    try {
      config = withStorybook({ projectRoot: root, resolver: {}, serializer: {} }, {});
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }

    // The old road would throw for want of a config folder; this one carries Sherlo's steps.
    expect(typeof config.resolver.resolveRequest).toBe('function');
    expect(typeof config.server.enhanceMiddleware).toBe('function');
  });

  it('an app with a Storybook config folder and no scene file gets no scene boot', () => {
    const root = mkSdkProject('sherlo-storybook-road-');
    fs.mkdirSync(path.join(root, '.rnstorybook'));
    fs.writeFileSync(
      path.join(root, '.rnstorybook/main.js'),
      "module.exports = { stories: ['../src/**/*.stories.?(ts|tsx|js|jsx)'], addons: [] };\n"
    );

    const leaveBundlingProcess = enterBundlingProcess({ SHERLO_BUILD: 'app-and-storybook' }, [
      'start',
    ]);
    let config;
    let sceneListWritten;
    try {
      config = withStorybook(
        { projectRoot: root, resolver: {}, serializer: {} },
        { configPath: path.join(root, '.rnstorybook') }
      );
      sceneListWritten = fs.existsSync(
        path.join(root, 'node_modules/.cache/sherlo/bundled-scenes.js')
      );
    } finally {
      leaveBundlingProcess();
      fs.rmSync(root, { recursive: true, force: true });
    }

    // Storybook's road, as before: no early-boot module run and no scene list written.
    expect(config.serializer.getModulesRunBeforeMainModule).toBeUndefined();
    expect(sceneListWritten).toBe(false);
  });
});
