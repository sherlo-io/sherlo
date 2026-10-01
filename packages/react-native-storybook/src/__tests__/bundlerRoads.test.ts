/**
 * THE SDK'S TWO ROADS TO THE BUNDLER - `sherlo capture`'s and `sherlo open`'s - and how they reach
 * the sealed core.
 *
 * The walk of a capture and the letterbox's collect loop are the core's (packages/sherlo-core/js,
 * where their own suites live). What stays open in the SDK is the road itself: the address, the
 * method and the body of every request the app sends the bundler's middleware, and the door that
 * hands the road to the core. This suite runs against the core built from its source
 * (./__mocks__/sealedCoreFromSource), the way the app runs against the shipped one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeModules } from 'react-native';
import { bundlerCapture, startCaptureTransport, stopCaptureTransport } from '../captureTransport';
import { bundlerLetterbox, startOpenStoryChannel, stopOpenStoryChannel } from '../openStoryChannel';

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

  it('is handed to the core, which asks it with the mode and the stories of the app', async () => {
    const waitForACapture = vi.fn(() => new Promise<never>(() => {}));

    startCaptureTransport({
      view,
      channel: makeChannel(),
      capture: { waitForACapture },
    });

    await vi.waitFor(() => expect(waitForACapture).toHaveBeenCalled());
    expect(waitForACapture).toHaveBeenCalledWith({
      mode: 'default',
      stories: [STORY],
      answer: null,
    });
  });

  it('is not there for an app whose JavaScript came from a file, so no capture starts', async () => {
    delete NativeModules.SourceCode;
    const fetchMock = bundlerAnswering({});

    expect(bundlerCapture()).toBeNull();
    startCaptureTransport({ view, channel: makeChannel() });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('is handed to the core, which asks it with the stories of the app and where it stands', async () => {
    const waitForStory = vi.fn(() => new Promise<never>(() => {}));

    startOpenStoryChannel({
      view,
      channel: makeChannel(),
      atTheStoryBrowser: true,
      letterbox: { waitForStory },
    });

    await vi.waitFor(() => expect(waitForStory).toHaveBeenCalled());
    expect(waitForStory).toHaveBeenCalledWith({
      stories: [STORY],
      showing: null,
      atTheStoryBrowser: true,
      threw: null,
    });
  });

  it('is not there for an app whose JavaScript came from a file, so `sherlo open` starts nothing', async () => {
    delete NativeModules.SourceCode;
    const fetchMock = bundlerAnswering({});

    expect(bundlerLetterbox()).toBeNull();
    startOpenStoryChannel({ view, channel: makeChannel(), atTheStoryBrowser: true });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
