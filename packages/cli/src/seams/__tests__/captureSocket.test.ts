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
