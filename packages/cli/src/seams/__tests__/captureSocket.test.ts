/**
 * THE CAPTURE RELAY ON THE BUNDLER - the road `sherlo capture` reaches a running app down, held
 * over a real server on a real port, with the SDK's own line (`metro/sherloLine.js`) mounted on it
 * by `attach` and a pretend app on a socket of its own, saying hello as native code does.
 *
 * What is pinned here is the ONE thing the relay must NOT do: remember. The letterbox remembers a
 * story across a restart; a capture is a conversation - settings one way, a whole view tree the
 * other - and the relay only ever pairs one waiting app with one waiting tool. Two captures run
 * back-to-back, each a different story with a different answer, and the second comes back whole:
 * the first left nothing behind for it to find.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import WebSocket, { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import {
  attach,
  LINE_PATH,
  PROTOCOL_VERSION,
} from '../../../../react-native-storybook/metro/sherloLine';
import type { WebSocketServerClass } from '../../../../react-native-storybook/metro/sherloLine';
import { liveCaptureSocket, STABILIZATION_SETTINGS } from '../captureSocket';

const STORY_A = 'components-button--primary';
const STORY_B = 'components-avatar--basic';

type RunningRelay = {
  port: number;
  /** The pretend app on the bundler's line. */
  app: PretendApp;
  close: () => Promise<void>;
};

/** An app that said hello on the line, and can wait for a capture and push log lines. */
type PretendApp = {
  socket: WebSocket;
  /** Resolves with the next instruction the line sends this app, without its `action`. */
  nextInstruction: () => Promise<unknown>;
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

/** The plain-HTTP half of a bundler that has the line on it: the GET answers the protocol. */
function answerThePlainGet(request: http.IncomingMessage, response: http.ServerResponse): void {
  if (request.url !== LINE_PATH) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ protocolVersion: PROTOCOL_VERSION }));
}

/** Close a server the way a bundler going away does: every socket and request cut. */
function closeServer(server: http.Server): Promise<void> {
  return new Promise<void>((closed) => {
    (server as { closeAllConnections?: () => void }).closeAllConnections?.();
    server.close(() => closed());
  });
}

/** A bundler with the SDK's line on it, and an app that said hello on the line. */
async function startRelay(): Promise<RunningRelay> {
  const server = http.createServer(answerThePlainGet);
  // `ws` types its classes more strictly than the line's own narrow view of the one it uses.
  attach(server, WebSocketServer as unknown as WebSocketServerClass);
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const port = (server.address() as AddressInfo).port;

  const app = await connectApp(port);

  return {
    port,
    app,
    close: () => {
      app.socket.terminate();
      return closeServer(server);
    },
  };
}

/** An app on the line: native code says hello first, and then the JavaScript waits and logs. */
async function connectApp(port: number): Promise<PretendApp> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${LINE_PATH}`);
  const waitingForInstructions: Array<(instruction: unknown) => void> = [];

  socket.on('message', (data) => {
    const { action, ...instruction } = JSON.parse(data.toString());
    if (action === 'captureInstruction') waitingForInstructions.shift()?.(instruction);
  });

  await new Promise((opened) => socket.once('open', opened));
  socket.send(
    JSON.stringify({
      action: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      nativeVersion: 'test',
      jsVersion: null,
    })
  );

  return {
    socket,
    nextInstruction: () =>
      new Promise((resolve) => {
        waitingForInstructions.push(resolve);
      }),
  };
}

/** Push one line to the line's log feed, the way the app's log sink does. */
async function appLogs(relay: RunningRelay, line: string): Promise<void> {
  relay.app.socket.send(JSON.stringify({ action: 'log', line }));
  await letTheRequestLand();
}

/**
 * The app's wait for a capture: say what mode and stories I have, and what I last recorded. The
 * promise is what the line answers it with, once there is something to say.
 */
function appReports(
  relay: RunningRelay,
  saying: { mode: string; stories: string[]; answer: unknown }
): Promise<unknown> {
  const instruction = relay.app.nextInstruction();
  relay.app.socket.send(JSON.stringify({ action: 'waitForACapture', ...saying }));
  return instruction;
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
  const appWaits = appReports(r, { mode: 'testing', stories, answer: null });
  await letTheRequestLand();

  const toolAsks = liveCaptureSocket.captureStory({
    storyId: askedFor,
    port: r.port,
    settings: STABILIZATION_SETTINGS,
  });

  await appWaits;
  await appReports(r, { mode: 'testing', stories, answer: recorded });

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
    const firstAsk = appReports(r, { mode: 'testing', stories: [STORY_A], answer: null });
    await letTheRequestLand();
    const firstCapture = liveCaptureSocket.captureStory({
      storyId: STORY_A,
      port: r.port,
      settings: STABILIZATION_SETTINGS,
    });
    expect(await firstAsk).toEqual({ storyId: STORY_A, settings: STABILIZATION_SETTINGS });
    await appReports(r, { mode: 'testing', stories: [STORY_A], answer: ANSWER_A });
    expect(await firstCapture).toEqual({
      kind: 'captured',
      storyId: STORY_A,
      settled: { ms: 120, frames: 6 },
      tree: { primitive: 'RCTView', components: [], children: [] },
    });

    // Capture B, straight after: a different story and a different answer. If the relay remembered
    // anything of A, B would come back with A's tree, A's story, or no answer at all.
    const secondAsk = appReports(r, { mode: 'testing', stories: [STORY_B], answer: null });
    await letTheRequestLand();
    const secondCapture = liveCaptureSocket.captureStory({
      storyId: STORY_B,
      port: r.port,
      settings: STABILIZATION_SETTINGS,
    });
    expect(await secondAsk).toEqual({ storyId: STORY_B, settings: STABILIZATION_SETTINGS });
    await appReports(r, { mode: 'testing', stories: [STORY_B], answer: ANSWER_B });
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

  it("the device's own density and font scale come back beside the tree", async () => {
    const r = await relay();

    expect(
      await aCapture(r, {
        askedFor: STORY_A,
        stories: [STORY_A],
        recorded: { ...ANSWER_A, density: 3, fontScale: 1.3 },
      })
    ).toEqual({
      kind: 'captured',
      storyId: STORY_A,
      settled: { ms: 120, frames: 6 },
      density: 3,
      fontScale: 1.3,
      tree: { primitive: 'RCTView', components: [], children: [] },
    });
  });

  it("a view's size, style, testID and props come back with it, merged into one props set", async () => {
    const r = await relay();

    expect(
      await aCapture(r, {
        askedFor: STORY_A,
        stories: [STORY_A],
        recorded: {
          ...ANSWER_A,
          tree: {
            primitive: 'RCTScrollView',
            components: [],
            size: { width: 130, height: 281 },
            style: { backgroundColor: 'red' },
            testID: 'the-story',
            props: { numberOfLines: 2, accessibilityLabel: 'Font sizes list' },
            children: [],
          },
        },
      })
    ).toEqual({
      kind: 'captured',
      storyId: STORY_A,
      settled: { ms: 120, frames: 6 },
      tree: {
        primitive: 'RCTScrollView',
        components: [],
        size: { width: 130, height: 281 },
        style: { backgroundColor: 'red' },
        // testID rides inside props, beside the placeholder/numberOfLines/accessibilityLabel a
        // fiber's own props carried - the same set the screen draws as one set of attributes.
        props: {
          testID: 'the-story',
          numberOfLines: 2,
          accessibilityLabel: 'Font sizes list',
        },
        children: [],
      },
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

  it('why the app found a published reading that never named the story comes back with it: whether it had published anything yet, when its provider first rendered relative to its poll, and what the reading held', async () => {
    const r = await relay();

    // What the app says when its poll for a reading naming the story ran out, having found ONE that
    // never did - carried across, not reconstructed here from the fact the tree happens to be the
    // whole window. `cause: 'story-unnamed'`, not the merged `'no-metadata'` this used to be (see
    // the SDK's own WindowReason). `testIdsAtGiveUp` names the OTHER story the reading held - the
    // fact that tells a traversal bug (empty) apart from a selection bug (some other story's id).
    expect(
      await aCapture(r, {
        askedFor: STORY_A,
        stories: [STORY_A],
        recorded: {
          ...ANSWER_A,
          root: {
            at: 'window',
            nodeCount: 5,
            reason: {
              cause: 'story-unnamed',
              publishedAtPollStart: false,
              providerRenderedRelativeToPollMs: 340,
              testIdsAtGiveUp: ['components-splash--default'],
            },
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
        reason: {
          cause: 'story-unnamed',
          publishedAtPollStart: false,
          providerRenderedRelativeToPollMs: 340,
          testIdsAtGiveUp: ['components-splash--default'],
        },
      },
    });
  });

  it('reads testIdsAtGiveUp as empty, never dropped, when an older app sent a story-unnamed reason with no such field', async () => {
    const r = await relay();

    // An app built before this field existed sends `story-unnamed` with none of it - the same
    // "older app" case the no-metadata-cause test below covers for the whole reason, but this reason
    // must still come back whole rather than being dropped for one missing field: an empty reading
    // and an absent field mean the same thing here (nothing known to name), so this reads as [].
    const answer = await aCapture(r, {
      askedFor: STORY_A,
      stories: [STORY_A],
      recorded: {
        ...ANSWER_A,
        root: {
          at: 'window',
          nodeCount: 5,
          reason: { cause: 'story-unnamed', publishedAtPollStart: true },
        },
      },
    });

    expect((answer as { root: { reason: unknown } }).root.reason).toEqual({
      cause: 'story-unnamed',
      publishedAtPollStart: true,
      testIdsAtGiveUp: [],
    });
  });

  it('why the app found nothing published at all comes back with it, with no publishedAtPollStart to carry', async () => {
    const r = await relay();

    // 'nothing-published' has no `publishedAtPollStart` field: it is always false by definition of
    // the cause (something published at poll start would BE a published reading), so carrying it
    // would only repeat what the cause already says.
    const answer = await aCapture(r, {
      askedFor: STORY_A,
      stories: [STORY_A],
      recorded: {
        ...ANSWER_A,
        root: {
          at: 'window',
          nodeCount: 5,
          reason: { cause: 'nothing-published', providerRenderedRelativeToPollMs: undefined },
        },
      },
    });

    expect((answer as { root: { reason: unknown } }).root.reason).toEqual({
      cause: 'nothing-published',
    });
  });

  it('an app whose no-metadata cause predates the split names no reason, rather than guessing which of the two it meant', async () => {
    const r = await relay();

    // An app old enough to still send the single, merged `'no-metadata'` cause this was split from
    // (see the SDK's own WindowReason) cannot be told apart into 'nothing-published' or
    // 'story-unnamed' after the fact - that is exactly the distinction this app never made. Reading
    // it as either would be a guess, so this seam drops the reason instead of inventing one, the
    // same way it drops any field an older app never sent.
    const answer = await aCapture(r, {
      askedFor: STORY_A,
      stories: [STORY_A],
      recorded: {
        ...ANSWER_A,
        root: {
          at: 'window',
          nodeCount: 5,
          reason: { cause: 'no-metadata', publishedAtPollStart: false },
        },
      },
    });

    expect((answer as { root: { reason: unknown } }).root.reason).toBeUndefined();
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

  it('an answer naming broken story files reads as no such story, with each file and its error', async () => {
    const r = await relay();
    const error = { name: 'SyntaxError', message: 'Unexpected token' };

    expect(
      await aCapture(r, {
        askedFor: STORY_A,
        stories: [STORY_A],
        recorded: {
          kind: 'no-such-story',
          known: [STORY_B],
          brokenFiles: [{ file: 'Button.stories.tsx', error }, { file: 7 }, 'nope'],
        },
      })
    ).toEqual({
      kind: 'no-such-story',
      known: [STORY_B],
      brokenFiles: [{ file: 'Button.stories.tsx', error }],
    });
  });

  it('an answer that never settled carries the views still changing', async () => {
    const r = await relay();

    const answer = await aCapture(r, {
      askedFor: STORY_A,
      stories: [STORY_A],
      recorded: { ...ANSWER_A, settled: 'timed-out', changing: ['Image', 7, 'Text'] },
    });

    expect(answer).toMatchObject({ settled: 'timed-out', changing: ['Image', 'Text'] });
  });

  it("an answer carries the app's own modules that ran as real code and the requests no mock answered", async () => {
    const r = await relay();

    const answer = await aCapture(r, {
      askedFor: STORY_A,
      stories: [STORY_A],
      recorded: {
        ...ANSWER_A,
        stillReal: ['src/theme.ts'],
        unanswered: [{ method: 'GET', url: 'https://api.example.com/me' }, { method: 'GET' }],
      },
    });

    expect(answer).toMatchObject({
      stillReal: ['src/theme.ts'],
      unanswered: [{ method: 'GET', url: 'https://api.example.com/me' }],
    });

    const bare = await aCapture(r, { askedFor: STORY_A, stories: [STORY_A], recorded: ANSWER_A });
    expect(bare).not.toHaveProperty('stillReal');
    expect(bare).not.toHaveProperty('unanswered');
  });

  it('an unanswered GraphQL request keeps the operation the app named, and nothing else it sent', async () => {
    const r = await relay();
    const graphql = 'https://core.dev-api.fldcore.com/graphql';

    const answer = await aCapture(r, {
      askedFor: STORY_A,
      stories: [STORY_A],
      recorded: {
        ...ANSWER_A,
        unanswered: [
          // As the SDK lists Apollo's refused AuthProvider query (networkRules answerFor).
          { method: 'POST', url: graphql, operation: 'AuthProvider' },
          // No operation could be named: method and address alone.
          { method: 'POST', url: graphql },
          { method: 'POST', url: graphql, operation: '' },
          { method: 'POST', url: graphql, operation: 7, body: '{"token":"secret"}' },
          // A WebSocket no rule matched (networkRules socketVerdictFor): no payload is ever kept.
          { method: 'WS', url: 'wss://subscriptions.example.com/graphql', payload: 'token' },
        ],
      },
    });

    // toEqual on the list, not toMatchObject: an entry holds no key beyond these.
    expect((answer as { unanswered?: unknown }).unanswered).toEqual([
      { method: 'POST', url: graphql, operation: 'AuthProvider' },
      { method: 'POST', url: graphql },
      { method: 'POST', url: graphql },
      { method: 'POST', url: graphql },
      { method: 'WS', url: 'wss://subscriptions.example.com/graphql' },
    ]);
  });

  it("an answer that says the app crashed as it started carries the app's own error", async () => {
    const r = await relay();
    const error = { name: 'Invariant Violation', message: 'Native module cannot be null' };

    expect(
      await aCapture(r, {
        askedFor: STORY_A,
        stories: [STORY_A],
        recorded: { kind: 'crashed', error },
      })
    ).toEqual({ kind: 'crashed', storyId: STORY_A, error });
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

describe("the app's own log lines, drained from its live feed once the answer is known", () => {
  const running: RunningRelay[] = [];

  afterEach(async () => {
    while (running.length) await running.pop()!.close();
  });

  async function relay(): Promise<RunningRelay> {
    const r = await startRelay();
    running.push(r);
    return r;
  }

  it('carries whatever the app pushed to its live feed during the walk - not merely what its own answer said', async () => {
    const r = await relay();
    await appLogs(r, '12:00:00: storybook style : {"style":"dark"}');
    await appLogs(r, '12:00:01: attempt to test story');

    const answer = await aCapture(r, { askedFor: STORY_A, stories: [STORY_A], recorded: ANSWER_A });

    expect(answer).toEqual({
      kind: 'captured',
      storyId: STORY_A,
      settled: { ms: 120, frames: 6 },
      tree: { primitive: 'RCTView', components: [], children: [] },
      logs: ['12:00:00: storybook style : {"style":"dark"}', '12:00:01: attempt to test story'],
    });
  });

  it('carries no `logs` field at all when the feed was empty, rather than an empty array', async () => {
    const r = await relay();

    const answer = await aCapture(r, { askedFor: STORY_A, stories: [STORY_A], recorded: ANSWER_A });

    expect(answer).not.toHaveProperty('logs');
  });

  it("a second capture's own read never sees the first capture's lines again - the feed is drained, not merely peeked", async () => {
    const r = await relay();
    await appLogs(r, 'only capture A logged this');

    await aCapture(r, { askedFor: STORY_A, stories: [STORY_A], recorded: ANSWER_A });
    const secondAnswer = await aCapture(r, {
      askedFor: STORY_B,
      stories: [STORY_B],
      recorded: ANSWER_B,
    });

    expect(secondAnswer).not.toHaveProperty('logs');
  });

  it('the crash ending carries whatever reached the feed before the app said it died', async () => {
    const r = await relay();
    await appLogs(r, '12:00:00: paint barrier error : {"error":"timed out"}');
    const died = { name: 'RangeError', message: 'Maximum call stack size exceeded' };

    const answer = await aCapture(r, {
      askedFor: STORY_A,
      stories: [STORY_A],
      recorded: { kind: 'crashed', storyId: STORY_A, error: died },
    });

    expect(answer).toEqual({
      kind: 'crashed',
      storyId: STORY_A,
      error: died,
      logs: ['12:00:00: paint barrier error : {"error":"timed out"}'],
    });
  });

  it('a line that cannot read its log lines out is read as silence, not a failure', async () => {
    // A line that answers the capture and then answers the log read with nothing readable.
    const server = http.createServer(answerThePlainGet);
    const sockets = new WebSocketServer({ server, path: LINE_PATH });
    sockets.on('connection', (socket) => {
      socket.on('message', (data) => {
        const { action, askId } = JSON.parse(data.toString());
        const reply = action === 'captureStory' ? ANSWER_A : { lines: 'not a list' };
        socket.send(JSON.stringify({ action: 'reply', askId, reply }));
      });
    });
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));

    try {
      const answer = await liveCaptureSocket.captureStory({
        storyId: STORY_A,
        port: (server.address() as AddressInfo).port,
        settings: STABILIZATION_SETTINGS,
      });

      expect(answer).toMatchObject({ kind: 'captured', storyId: STORY_A });
      expect(answer).not.toHaveProperty('logs');
    } finally {
      sockets.clients.forEach((socket) => socket.terminate());
      await closeServer(server);
    }
  });
});
