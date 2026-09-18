/**
 * THE LETTERBOX ON THE BUNDLER - the road something outside a running app tells the SDK which story
 * to show.
 *
 * WHAT THESE FOUR HOLD, and why they are worth holding. The first two are the road itself: a story
 * posted at the bundler's address reaches whichever app is waiting, and the app answers back at the
 * same address once the story is painted - which is what lets `sherlo open --wait` make an
 * end-to-end claim rather than report a message sent. The third is the one that is easy to get
 * wrong: the letterbox REMEMBERS the story it was last given rather than relaying it, because
 * reaching the story browser costs a restart and a relay would drop the ask on the floor. The
 * fourth says the road is live rather than launch-time - the story on screen is replaced where it
 * stands.
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

const STORY = 'components-button--primary';
const OTHER_STORY = 'components-avatar--basic';

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
  saying: { stories: string[]; showing: string | null }
): Promise<{ storyId: string | null }> {
  return fetch(`${bundler.origin}/sherlo/letterbox`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saying),
  }).then((response) => response.json() as Promise<{ storyId: string | null }>);
}

/** The tool's side of the address: post a story, and read what became of it. */
function toolPostsAStory(
  bundler: RunningBundler,
  posting: { storyId: string; wait?: boolean; timeoutSeconds?: number }
): Promise<{ kind: string; storyId?: string; rendered?: string; known?: string[] }> {
  return fetch(`${bundler.origin}/sherlo/letterbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(posting),
  }).then((response) => response.json() as Promise<{ kind: string }>);
}

describe('the letterbox on the bundler', () => {
  const runningBundlers: RunningBundler[] = [];

  afterEach(async () => {
    while (runningBundlers.length) await runningBundlers.pop()!.close();
    stopOpenStoryChannel();
    __resetStoryRenderedTrackingForTests();
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

    const asked: Array<{ stories: string[]; showing: string | null }> = [];
    const askedAgain = new Promise<void>((resolve) => {
      const letterbox: BundlerLetterbox = {
        waitForStory: async (saying) => {
          asked.push(saying);
          if (asked.length > 1) {
            resolve();
            return new Promise(() => {}); // the app goes on waiting; the test is done asking
          }
          return STORY;
        },
      };
      startOpenStoryChannel({ view, channel, letterbox });
    });

    // The story travels Storybook's own channel - the app is not restarted and nothing is reloaded.
    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );
    channel.emit('storyRendered', STORY);

    await askedAgain;
    expect(asked[0]).toEqual({ stories: [STORY, OTHER_STORY], showing: OTHER_STORY });
    // Having painted it, the app now names the new story as the one on screen.
    expect(asked[1]).toEqual({ stories: [STORY, OTHER_STORY], showing: STORY });
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
