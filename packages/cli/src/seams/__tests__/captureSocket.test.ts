/**
 * THE CAPTURE RELAY ON THE BUNDLER - the road `sherlo capture` reaches a running app down, held
 * over real HTTP against the middleware mounted on a real server on a real port.
 *
 * What is pinned here is the ONE thing the relay must NOT do: remember. The letterbox remembers a
 * story across a restart; a capture is a conversation - settings one way, a whole view tree the
 * other - and the relay only ever pairs one waiting app with one waiting tool. Two captures run
 * back-to-back, each a different story with a different answer, and the second comes back whole:
 * the first left nothing behind for it to find.
 */
import * as http from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import { liveCaptureSocket, STABILIZATION_SETTINGS } from '../captureSocket';

const createCaptureSocket = require('../../../../react-native-storybook/metro/captureSocket.js');

const STORY_A = 'components-button--primary';
const STORY_B = 'components-avatar--basic';

type RunningRelay = {
  origin: string;
  port: number;
  close: () => Promise<void>;
};

/** The app's answer to capture A, in the app's own words. */
const ANSWER_A = {
  kind: 'captured',
  storyId: STORY_A,
  settled: { ms: 120, frames: 6 },
  tree: { primitive: 'RCTView', components: [], children: [] },
};

/** The app's answer to capture B - a different story, a different tree, a different settling. */
const ANSWER_B = {
  kind: 'captured',
  storyId: STORY_B,
  settled: { ms: 340, frames: 6 },
  tree: { primitive: 'RCTTextView', components: [], children: [] },
};

/** A bundler with the capture relay on it. */
async function startRelay(): Promise<RunningRelay> {
  const relay = createCaptureSocket();
  const server = http.createServer((request, response) => {
    relay.middleware(request, response, () => {
      response.writeHead(404);
      response.end();
    });
  });

  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const port = (server.address() as { port: number }).port;

  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((closed) => {
        (server as { closeAllConnections?: () => void }).closeAllConnections?.();
        server.close(() => closed());
      }),
  };
}

/** The app's side of the address: say what mode and stories I have, and what I last recorded. */
function appReports(
  origin: string,
  saying: { mode: string; stories: string[]; answer: unknown }
): Promise<unknown> {
  return fetch(`${origin}/sherlo/capture`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saying),
  }).then((response) => response.json());
}

/** Long enough for a request just started to have reached the server on the other side. */
function letTheRequestLand(): Promise<void> {
  return new Promise((landed) => setTimeout(landed, 50));
}

/** A port nothing is serving on: one is opened and closed, so the number is certainly free. */
async function portWithNothingOnIt(): Promise<number> {
  const empty = await startRelay();
  await empty.close();
  return empty.port;
}

/**
 * One whole capture, in the order the address carries it: the app waits for work, the tool asks for
 * a story, and the app comes back with what it recorded.
 */
async function aCapture(
  r: RunningRelay,
  { askedFor, stories, recorded }: { askedFor: string; stories: string[]; recorded: unknown }
): Promise<unknown> {
  const appWaits = appReports(r.origin, { mode: 'testing', stories, answer: null });
  await letTheRequestLand();

  const toolAsks = liveCaptureSocket.captureStory({
    storyId: askedFor,
    port: r.port,
    settings: STABILIZATION_SETTINGS,
  });

  await appWaits;
  await appReports(r.origin, { mode: 'testing', stories, answer: recorded });

  return toolAsks;
}

describe('the bundler relays the capture between the command and the app, and holds nothing of its own', () => {
  const running: RunningRelay[] = [];

  afterEach(async () => {
    while (running.length) await running.pop()!.close();
  });

  async function relay(): Promise<RunningRelay> {
    const r = await startRelay();
    running.push(r);
    return r;
  }

  it('relays the capture without keeping any of its own state', async () => {
    const r = await relay();

    // Capture A: the app reports story A in testing mode, is handed A with its settings, walks, and
    // answers A.
    const firstAsk = appReports(r.origin, { mode: 'testing', stories: [STORY_A], answer: null });
    await letTheRequestLand();
    const firstCapture = liveCaptureSocket.captureStory({
      storyId: STORY_A,
      port: r.port,
      settings: STABILIZATION_SETTINGS,
    });
    expect(await firstAsk).toEqual({ storyId: STORY_A, settings: STABILIZATION_SETTINGS });
    await appReports(r.origin, { mode: 'testing', stories: [STORY_A], answer: ANSWER_A });
    expect(await firstCapture).toEqual({
      kind: 'captured',
      storyId: STORY_A,
      settled: { ms: 120, frames: 6 },
      tree: { primitive: 'RCTView', components: [], children: [] },
    });

    // Capture B, straight after: a different story and a different answer. If the relay remembered
    // anything of A, B would come back with A's tree, A's story, or no answer at all.
    const secondAsk = appReports(r.origin, { mode: 'testing', stories: [STORY_B], answer: null });
    await letTheRequestLand();
    const secondCapture = liveCaptureSocket.captureStory({
      storyId: STORY_B,
      port: r.port,
      settings: STABILIZATION_SETTINGS,
    });
    expect(await secondAsk).toEqual({ storyId: STORY_B, settings: STABILIZATION_SETTINGS });
    await appReports(r.origin, { mode: 'testing', stories: [STORY_B], answer: ANSWER_B });
    expect(await secondCapture).toEqual({
      kind: 'captured',
      storyId: STORY_B,
      settled: { ms: 340, frames: 6 },
      tree: { primitive: 'RCTTextView', components: [], children: [] },
    });
  });
});

describe("the app's answer, read into this seam's own endings", () => {
  const running: RunningRelay[] = [];

  afterEach(async () => {
    while (running.length) await running.pop()!.close();
  });

  async function relay(): Promise<RunningRelay> {
    const r = await startRelay();
    running.push(r);
    return r;
  }

  it('a port with nothing on it is no bundler, not a crash', async () => {
    const port = await portWithNothingOnIt();

    expect(
      await liveCaptureSocket.captureStory({
        storyId: STORY_A,
        port,
        settings: STABILIZATION_SETTINGS,
      })
    ).toEqual({ kind: 'no-bundler' });
  });

  it('a relay no Sherlo app ever reached has no app behind it', async () => {
    const r = await relay();

    expect(
      await liveCaptureSocket.captureStory({
        storyId: STORY_A,
        port: r.port,
        settings: STABILIZATION_SETTINGS,
      })
    ).toEqual({ kind: 'no-app' });
  });

  it('the stories the app really has come back when it does not have the one asked for', async () => {
    const r = await relay();

    expect(
      await aCapture(r, { askedFor: STORY_A, stories: [STORY_B], recorded: ANSWER_B })
    ).toEqual({ kind: 'no-such-story', known: [STORY_B] });
  });

  it('the two facts beside the tree - the screenfuls and the network image - come back with it', async () => {
    const r = await relay();

    expect(
      await aCapture(r, {
        askedFor: STORY_A,
        stories: [STORY_A],
        recorded: { ...ANSWER_A, parts: 3, hasNetworkImage: true },
      })
    ).toEqual({
      kind: 'captured',
      storyId: STORY_A,
      settled: { ms: 120, frames: 6 },
      parts: 3,
      hasNetworkImage: true,
      tree: { primitive: 'RCTView', components: [], children: [] },
    });
  });

  it('an app older than the two facts leaves them absent rather than guessed at', async () => {
    const r = await relay();

    // What a story that fits one screen and carries no network image would say, and what an app
    // that has never heard of either field says too: nothing. The screen says no more for both,
    // which is why an absent fact must not arrive here as a `false` or a `1` this side invented.
    expect(
      await aCapture(r, { askedFor: STORY_A, stories: [STORY_A], recorded: ANSWER_A })
    ).toEqual({
      kind: 'captured',
      storyId: STORY_A,
      settled: { ms: 120, frames: 6 },
      tree: { primitive: 'RCTView', components: [], children: [] },
    });
  });

  it('how the app waited, and what the tree it recorded was rooted at, come back with it', async () => {
    const r = await relay();

    // What the app says over the wire when a wait had to poll before it saw what it was waiting
    // for - carried across, not reconstructed from the tree or the timing alone.
    expect(
      await aCapture(r, {
        askedFor: STORY_A,
        stories: [STORY_A],
        recorded: {
          ...ANSWER_A,
          waited: {
            metadata: { outcome: 'polled', ms: 24 },
            storyViews: { outcome: 'timed-out', ms: 2001, rereads: 187 },
          },
          root: { at: 'window', nodeCount: 9 },
        },
      })
    ).toEqual({
      kind: 'captured',
      storyId: STORY_A,
      settled: { ms: 120, frames: 6 },
      tree: { primitive: 'RCTView', components: [], children: [] },
      waited: {
        metadata: { outcome: 'polled', ms: 24 },
        storyViews: { outcome: 'timed-out', ms: 2001, rereads: 187 },
      },
      root: { at: 'window', nodeCount: 9 },
    });
  });

  it('an app older than the wait facts leaves them absent too', async () => {
    const r = await relay();

    const answer = await aCapture(r, { askedFor: STORY_A, stories: [STORY_A], recorded: ANSWER_A });

    expect(answer).not.toHaveProperty('waited');
    expect(answer).not.toHaveProperty('root');
  });

  it('why a window root was recorded comes back with it, read straight off the wire', async () => {
    const r = await relay();

    // What the app says when the story on screen was judged broken by its fallback words, and
    // which fiber generation the live-tag check read them off - carried across, not reconstructed
    // here from a tree that merely happens to be the whole window.
    expect(
      await aCapture(r, {
        askedFor: STORY_A,
        stories: [STORY_A],
        recorded: {
          ...ANSWER_A,
          root: {
            at: 'window',
            nodeCount: 5,
            reason: { cause: 'story-broken', source: 'fallback-text', generation: 'live' },
          },
        },
      })
    ).toEqual({
      kind: 'captured',
      storyId: STORY_A,
      settled: { ms: 120, frames: 6 },
      tree: { primitive: 'RCTView', components: [], children: [] },
      root: {
        at: 'window',
        nodeCount: 5,
        reason: { cause: 'story-broken', source: 'fallback-text', generation: 'live' },
      },
    });
  });

  it('a story root carries no reason, because it is never asked why', async () => {
    const r = await relay();

    const answer = await aCapture(r, {
      askedFor: STORY_A,
      stories: [STORY_A],
      recorded: { ...ANSWER_A, root: { at: 'story', nodeCount: 3 } },
    });

    expect((answer as { root: { at: string; reason?: unknown } }).root).toEqual({
      at: 'story',
      nodeCount: 3,
    });
  });

  it('an app older than the reason field leaves it absent, and keeps the rest of the root', async () => {
    const r = await relay();

    const answer = await aCapture(r, {
      askedFor: STORY_A,
      stories: [STORY_A],
      recorded: { ...ANSWER_A, root: { at: 'window', nodeCount: 9 } },
    });

    expect((answer as { root: { at: string; nodeCount: number } }).root).toEqual({
      at: 'window',
      nodeCount: 9,
    });
    expect(answer).not.toHaveProperty('root.reason');
  });

  it('an app that died mid-capture is a crash, and its last words come with it', async () => {
    const r = await relay();
    const died = { name: 'RangeError', message: 'Maximum call stack size exceeded' };

    expect(
      await aCapture(r, {
        askedFor: STORY_A,
        stories: [STORY_A],
        recorded: { kind: 'crashed', storyId: STORY_A, error: died },
      })
    ).toEqual({ kind: 'crashed', storyId: STORY_A, error: died });
  });

  it('an app that died without saying anything is still a crash, and still the story that was asked for', async () => {
    const r = await relay();

    expect(
      await aCapture(r, {
        askedFor: STORY_A,
        stories: [STORY_A],
        recorded: { kind: 'crashed', storyId: STORY_A },
      })
    ).toEqual({ kind: 'crashed', storyId: STORY_A });
  });
});
