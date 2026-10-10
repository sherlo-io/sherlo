/**
 * THE SDK'S TWO ROADS TO THE BUNDLER - `sherlo capture`'s and `sherlo open`'s - and how they reach
 * the sealed core.
 *
 * The walk of a capture and the letterbox's collect loop are the core's, and tested where the core
 * is built. What stays open in the SDK is the road itself: the address, the method and the body of
 * every request the app sends the bundler's middleware, and the door that hands the road to the
 * core. The core here is the suite's fake (./__mocks__/fakeSealedCore), which records what it is
 * handed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeModules } from 'react-native';
import { bundlerCapture, startCaptureTransport, stopCaptureTransport } from '../captureTransport';
import { bundlerLetterbox, startOpenStoryChannel, stopOpenStoryChannel } from '../openStoryChannel';
import { getSealedCore } from '../sealedCore/loadSealedCore';
import type { FakeSealedCore } from './__mocks__/fakeSealedCore';

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

const realFetch = globalThis.fetch;

/** A fetch that answers every request with `answer`, and remembers what it was asked. */
function bundlerAnswering(answer: unknown) {
  const fetchMock = vi.fn(async () => ({ json: async () => answer } as unknown as Response));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  (getSealedCore() as FakeSealedCore).calls.length = 0;
  NativeModules.SourceCode = {
    getConstants: () => ({ scriptURL: `${ORIGIN}/index.bundle?platform=ios` }),
  };
});

afterEach(() => {
  stopCaptureTransport();
  stopOpenStoryChannel();
  delete NativeModules.SourceCode;
  globalThis.fetch = realFetch;
});

describe("the SDK's road to the bundler's capture address", () => {
  it('asks the bundler for a capture with a PUT to /sherlo/capture, saying what the app says', async () => {
    const fetchMock = bundlerAnswering({ storyId: STORY });
    const saying = { mode: 'testing', stories: [STORY], answer: null };

    const instruction = await bundlerCapture()!.waitForACapture(saying);

    expect(instruction).toEqual({ storyId: STORY });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/sherlo/capture`);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual(saying);
  });

  it('is handed to the core with the view and the channel', () => {
    const capture = { waitForACapture: vi.fn() };
    const channel = makeChannel();

    startCaptureTransport({ view, channel, capture });

    expect(lastHandedTo('startCaptureTransport')).toEqual({ view, channel, capture });
  });

  it("is the bundler's own road when the SDK is handed none", () => {
    startCaptureTransport({ view, channel: makeChannel() });

    const { capture } = lastHandedTo('startCaptureTransport') as {
      capture: { waitForACapture: unknown };
    };
    expect(typeof capture.waitForACapture).toBe('function');
  });

  it('is not there for an app whose JavaScript came from a file, so no capture starts', () => {
    delete NativeModules.SourceCode;

    expect(bundlerCapture()).toBeNull();
    startCaptureTransport({ view, channel: makeChannel() });

    expect(lastHandedTo('startCaptureTransport')).toBeUndefined();
  });
});

describe("the SDK's road to the bundler's letterbox", () => {
  it('asks the bundler for a story with a PUT to /sherlo/letterbox, saying what the app says', async () => {
    const fetchMock = bundlerAnswering({ storyId: STORY });
    const saying = { stories: [STORY], showing: null, atTheStoryBrowser: true, threw: null };

    const answer = await bundlerLetterbox()!.waitForStory(saying);

    expect(answer).toEqual({ storyId: STORY });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/sherlo/letterbox`);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual(saying);
  });

  it('is handed to the core with the view, the channel and where the app stands', () => {
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
      view: storybookShowingAStory,
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
