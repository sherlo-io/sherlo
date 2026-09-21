/**
 * THE LETTERBOX ON THE BUNDLER - the road something outside a running app tells the SDK which story
 * to show.
 *
 * WHAT THE FIRST FOUR HOLD, and why they are worth holding. The first two are the road itself: a story
 * posted at the bundler's address reaches whichever app is waiting, and the app answers back at the
 * same address once the story is painted - which is what lets `sherlo open --wait` make an
 * end-to-end claim rather than report a message sent. The third is the one that is easy to get
 * wrong: the letterbox REMEMBERS the story it was last given rather than relaying it, because
 * reaching the story browser costs a restart and a relay would drop the ask on the floor. The
 * fourth says the road is live rather than launch-time - the story on screen is replaced where it
 * stands. The two after them are what the third one is FOR: an app showing itself is sent to the
 * story browser and the story is still there when it arrives, because `sherlo open` is for seeing
 * one story right now rather than launching the app and going to find it.
 *
 * THE LAST TWO ARE THE BROKEN STORY. A story that throws while rendering records what it threw in
 * the SDK's one story-error registry, and the app reports that alongside the story it painted - so
 * the developer who typed `sherlo open` because they are working on that story is the one told it
 * is broken. The first of the two holds the app's half (it reads the registry the error boundary
 * fills, rather than deciding brokenness a second way) and the second holds the bundler's (what
 * the app said travels back to the tool holding a `--wait` open).
 *
 * THE FIRST THREE ARE HELD OVER REAL HTTP, against the middleware mounted on a real server on a
 * real port. The thing under test is an address, and an address that is only ever called as a
 * function has not been shown to be one.
 */
import * as http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createOpenStoryLetterbox = require('../../metro/openStoryLetterbox');

import {
  startOpenStoryChannel,
  stopOpenStoryChannel,
  type BundlerLetterbox,
} from '../openStoryChannel';
import {
  startStoryRenderedTracking,
  __resetStoryRenderedTrackingForTests,
} from '../getStorybook/components/TestingMode/useTestAllStories/storyRenderedReadiness';
import { clearStoryError, recordStoryError } from '../getStorybook/storyErrorRegistry';

const STORY = 'components-button--primary';
const OTHER_STORY = 'components-avatar--basic';

/** What the app says about itself every time it asks. */
type Ask = {
  stories: string[];
  showing: string | null;
  atTheStoryBrowser: boolean;
  threw: { name: string; message: string } | null;
};

/** Called when the SDK asks the app to go to the story browser; set by the test that watches for it. */
let openedStorybook: (() => void) | null = null;

vi.mock('../openStorybook', () => ({
  default: () => openedStorybook?.(),
}));

/* ========================================================================== */
/* A bundler with the letterbox on it                                         */
/* ========================================================================== */

type RunningBundler = {
  origin: string;
  close: () => Promise<void>;
};

async function startBundlerWithLetterbox(settings?: {
  appHoldMs?: number;
}): Promise<RunningBundler> {
  const letterbox = createOpenStoryLetterbox(settings);
  const server = http.createServer((request, response) => {
    letterbox.middleware(request, response, () => {
      response.writeHead(404);
      response.end();
    });
  });

  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const port = (server.address() as { port: number }).port;

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((closed) => {
        // Cut any request still held open, so the server can actually close. Typed loosely
        // because older @types/node do not declare it.
        (server as { closeAllConnections?: () => void }).closeAllConnections?.();
        server.close(() => closed());
      }),
  };
}

/** The app's side of the address: say what I have and what is on screen, get the next story back. */
function appWaitsForAStory(
  bundler: RunningBundler,
  saying: {
    stories: string[];
    showing: string | null;
    atTheStoryBrowser?: boolean;
    threw?: { name: string; message: string };
  }
): Promise<{ storyId?: string | null; goToTheStoryBrowser?: boolean }> {
  return fetch(`${bundler.origin}/sherlo/letterbox`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    // Every app in these cases is at the story browser unless it says otherwise.
    body: JSON.stringify({ atTheStoryBrowser: true, ...saying }),
  }).then(
    (response) =>
      response.json() as Promise<{ storyId?: string | null; goToTheStoryBrowser?: boolean }>
  );
}

/** The tool's side of the address: post a story, and read what became of it. */
function toolPostsAStory(
  bundler: RunningBundler,
  posting: { storyId: string; wait?: boolean; timeoutSeconds?: number }
): Promise<{
  kind: string;
  storyId?: string;
  rendered?: string;
  known?: string[];
  threw?: { name: string; message: string };
}> {
  return fetch(`${bundler.origin}/sherlo/letterbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(posting),
  }).then((response) => response.json() as Promise<{ kind: string }>);
}

/** The tool's side of the address: ask which story is on screen right now. */
function toolAsksWhatIsOnScreen(
  bundler: RunningBundler
): Promise<{ kind: string; storyId?: string }> {
  return fetch(`${bundler.origin}/sherlo/letterbox`, { method: 'GET' }).then(
    (response) => response.json() as Promise<{ kind: string; storyId?: string }>
  );
}

describe('the letterbox on the bundler', () => {
  const runningBundlers: RunningBundler[] = [];

  afterEach(async () => {
    while (runningBundlers.length) await runningBundlers.pop()!.close();
    openedStorybook = null;
    stopOpenStoryChannel();
    __resetStoryRenderedTrackingForTests();
    clearStoryError(STORY);
  });

  async function bundler(settings?: { appHoldMs?: number }): Promise<RunningBundler> {
    const running = await startBundlerWithLetterbox(settings);
    runningBundlers.push(running);
    return running;
  }

  it('a waiting app is handed the story the command posted', async () => {
    const running = await bundler();

    // One request says what the app has and holds open until there is a story for it.
    const held = appWaitsForAStory(running, {
      stories: [STORY, OTHER_STORY],
      showing: OTHER_STORY,
    });
    await letTheRequestLand();

    const posted = await toolPostsAStory(running, { storyId: STORY });

    expect(posted).toEqual({ kind: 'handed-over', storyId: STORY, rendered: 'not-waited' });
    expect(await held).toEqual({ storyId: STORY });
  });

  it('the app answers over the same address once the story is painted', async () => {
    const running = await bundler();
    const held = appWaitsForAStory(running, { stories: [STORY], showing: null });
    await letTheRequestLand();

    // `--wait`: the tool's own request is held until the app says the story is painted.
    const waiting = toolPostsAStory(running, { storyId: STORY, wait: true, timeoutSeconds: 5 });
    expect(await held).toEqual({ storyId: STORY });

    // The app's next request over the SAME address names the story it has painted - and that is
    // the answer the waiting tool has been holding on for.
    appWaitsForAStory(running, { stories: [STORY], showing: STORY }).catch(() => {
      // The app is still holding this one open when the test ends and the bundler goes away.
    });

    expect(await waiting).toEqual({ kind: 'handed-over', storyId: STORY, rendered: 'yes' });
  });

  it('a story posted before any app is listening is delivered when one connects', async () => {
    // A hold short enough that the app's request has ended before the story is posted - the state
    // an app is in while it restarts into the story browser.
    const running = await bundler({ appHoldMs: 50 });
    expect(await appWaitsForAStory(running, { stories: [STORY], showing: null })).toEqual({
      storyId: null,
    });

    const posted = await toolPostsAStory(running, { storyId: STORY });
    expect(posted).toEqual({ kind: 'handed-over', storyId: STORY, rendered: 'not-waited' });

    // Nobody was listening when it was posted, and the app that connects next is handed it.
    expect(await appWaitsForAStory(running, { stories: [STORY], showing: null })).toEqual({
      storyId: STORY,
    });
  });

  it('a story asked for from outside replaces the one on screen without a restart', async () => {
    const channel = makeChannel();
    const view = { _storyIndex: { entries: { [STORY]: {}, [OTHER_STORY]: {} } } } as never;

    // Storybook is up and already showing one story, with the app listening to it.
    startStoryRenderedTracking(channel);
    channel.emit('storyRendered', OTHER_STORY);

    const asked: Ask[] = [];
    const askedAgain = new Promise<void>((resolve) => {
      const letterbox: BundlerLetterbox = {
        waitForStory: async (saying) => {
          asked.push(saying);
          if (asked.length > 1) {
            resolve();
            return new Promise(() => {}); // the app goes on waiting; the test is done asking
          }
          return { storyId: STORY };
        },
      };
      startOpenStoryChannel({ view, channel, atTheStoryBrowser: true, letterbox });
    });

    // The story travels Storybook's own channel - the app is not restarted and nothing is reloaded.
    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );
    channel.emit('storyRendered', STORY);

    await askedAgain;
    expect(asked[0]).toEqual({
      stories: [STORY, OTHER_STORY],
      showing: OTHER_STORY,
      atTheStoryBrowser: true,
      threw: null,
    });
    // Having painted it, the app now names the new story as the one on screen - and says it drew
    // cleanly, which is a fact it states every time rather than one it only mentions when it is bad.
    expect(asked[1]).toEqual({
      stories: [STORY, OTHER_STORY],
      showing: STORY,
      atTheStoryBrowser: true,
      threw: null,
    });
  });

  it('an app that is not at the story browser is sent there, and the story waits for it', async () => {
    const running = await bundler();

    // An app showing itself, not the story browser.
    const held = appWaitsForAStory(running, {
      stories: [STORY],
      showing: null,
      atTheStoryBrowser: false,
    });
    await letTheRequestLand();

    expect(await toolPostsAStory(running, { storyId: STORY })).toEqual({
      kind: 'handed-over',
      storyId: STORY,
      rendered: 'not-waited',
    });
    // It is sent to the story browser rather than handed a story it cannot paint.
    expect(await held).toEqual({ goToTheStoryBrowser: true });

    // Getting there restarts the app, and the story is still here when it comes back.
    expect(await appWaitsForAStory(running, { stories: [STORY], showing: null })).toEqual({
      storyId: STORY,
    });
  });

  it('an app showing itself goes to the story browser rather than swallowing the story', async () => {
    const channel = makeChannel();
    const view = { _storyIndex: { entries: { [STORY]: {} } } } as never;

    const asked: Ask[] = [];
    const wentToTheStoryBrowser = new Promise<void>((resolve) => {
      openedStorybook = resolve;
      const letterbox: BundlerLetterbox = {
        waitForStory: async (saying) => {
          asked.push(saying);
          return { goToTheStoryBrowser: true };
        },
      };
      startOpenStoryChannel({ view, channel, atTheStoryBrowser: false, letterbox });
    });

    await wentToTheStoryBrowser;

    expect(asked).toEqual([
      { stories: [STORY], showing: null, atTheStoryBrowser: false, threw: null },
    ]);
    // Nothing was put on screen here - there is no screen to put it on - and nothing was asked
    // again, because the app is on its way out.
    expect(channel.emitted('setCurrentStory')).toEqual([]);
  });

  it('a story that threw while rendering is reported as shown AND broken', async () => {
    const channel = makeChannel();
    const view = { _storyIndex: { entries: { [STORY]: {}, [OTHER_STORY]: {} } } } as never;

    startStoryRenderedTracking(channel);
    channel.emit('storyRendered', OTHER_STORY);

    const asked: Ask[] = [];
    const askedAgain = new Promise<void>((resolve) => {
      const letterbox: BundlerLetterbox = {
        waitForStory: async (saying) => {
          asked.push(saying);
          if (asked.length > 1) {
            resolve();
            return new Promise(() => {}); // the app goes on waiting; the test is done asking
          }
          return { storyId: STORY };
        },
      };
      startOpenStoryChannel({ view, channel, atTheStoryBrowser: true, letterbox });
    });

    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );

    // The story throws on its way to the screen: the error boundary around it records what it
    // threw, exactly as it does for the runner, and Storybook still reports the story rendered -
    // its error view is what is on screen.
    recordStoryError(STORY, {
      name: 'TypeError',
      message: "Cannot read property 'label' of undefined",
      stack: 'at Button (Button.tsx:12)',
      componentStack: '',
    });
    channel.emit('storyRendered', STORY);

    await askedAgain;
    // BOTH facts in one breath: the story IS on screen, and the screen is its error. Nothing here
    // decides that a second time - it is the registry the runner reads, read again.
    expect(asked[1]).toEqual({
      stories: [STORY, OTHER_STORY],
      showing: STORY,
      atTheStoryBrowser: true,
      threw: { name: 'TypeError', message: "Cannot read property 'label' of undefined" },
    });
  });

  it('what the app says its story threw reaches the tool waiting on that story', async () => {
    const running = await bundler();
    const held = appWaitsForAStory(running, { stories: [STORY], showing: null });
    await letTheRequestLand();

    const waiting = toolPostsAStory(running, { storyId: STORY, wait: true, timeoutSeconds: 5 });
    expect(await held).toEqual({ storyId: STORY });

    // The app paints the story, and the same request that says so says what it threw.
    appWaitsForAStory(running, {
      stories: [STORY],
      showing: STORY,
      threw: { name: 'TypeError', message: "Cannot read property 'label' of undefined" },
    }).catch(() => {
      // The app is still holding this one open when the test ends and the bundler goes away.
    });

    expect(await waiting).toEqual({
      kind: 'handed-over',
      storyId: STORY,
      rendered: 'yes',
      threw: { name: 'TypeError', message: "Cannot read property 'label' of undefined" },
    });
  });

  it('no app ever having connected is a different fact from an app that is attached and simply has nothing on screen', async () => {
    const running = await bundler();

    // Nothing has ever asked this address for a story.
    expect(await toolAsksWhatIsOnScreen(running)).toEqual({ kind: 'no-app' });

    // An app connects, showing itself rather than the story browser - it is attached, and there is
    // still nothing to name as being on screen.
    const held = appWaitsForAStory(running, {
      stories: [STORY],
      showing: null,
      atTheStoryBrowser: false,
    });
    await letTheRequestLand();

    expect(await toolAsksWhatIsOnScreen(running)).toEqual({ kind: 'not-at-story-browser' });

    held.catch(() => {
      // Still holding this one open when the test ends and the bundler goes away.
    });
  });

  it('reads the story an attached app has painted', async () => {
    const running = await bundler();

    const held = appWaitsForAStory(running, { stories: [STORY], showing: STORY });
    await letTheRequestLand();

    expect(await toolAsksWhatIsOnScreen(running)).toEqual({ kind: 'showing', storyId: STORY });

    held.catch(() => {
      // Still holding this one open when the test ends and the bundler goes away.
    });
  });
});

/* ========================================================================== */

/** Long enough for a request just started to have reached the server on the other side. */
function letTheRequestLand(): Promise<void> {
  return new Promise((landed) => setTimeout(landed, 50));
}

/** Storybook's channel, as much of it as this road uses. */
function makeChannel() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const emitted: Array<[string, unknown]> = [];

  return {
    on: (event: string, listener: (...args: unknown[]) => void) => {
      (listeners[event] ||= []).push(listener);
    },
    off: (event: string, listener: (...args: unknown[]) => void) => {
      listeners[event] = (listeners[event] || []).filter((other) => other !== listener);
    },
    emit: (event: string, ...args: unknown[]) => {
      emitted.push([event, args[0]]);
      (listeners[event] || []).slice().forEach((listener) => listener(...args));
    },
    emitted: (event: string) =>
      emitted.filter(([name]) => name === event).map(([, payload]) => payload),
  };
}
