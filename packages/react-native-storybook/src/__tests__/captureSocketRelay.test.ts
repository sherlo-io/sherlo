/**
 * THE CAPTURE RELAY'S RESTART INSTRUCTION CARRIES THE STORY - the metro middleware half of the
 * hand-over (see metro/captureSocket.js and ../captureTransport.ts). The relay already knows which
 * story the tool is waiting for at the exact moment it tells a not-yet-testing app to restart, from
 * either side of that race: the app arriving to find a tool already waiting, or a tool arriving to
 * find an app already held. Both are covered here, because the relay reaches "restart into testing"
 * through two different branches of its own code depending on which side spoke first.
 *
 * Driven directly against the middleware with minimal request/response doubles - no real HTTP
 * socket, no bundler - the same spirit as captureTransport.test.ts injecting the app's own half.
 */
import { describe, expect, it } from 'vitest';
import { createCaptureSocket } from '../../metro/captureSocket.js';
import { fakeRequest, fakeRes, noop } from './__mocks__/fakeBundlerExchange';

const STORY = 'components-button--primary';
const OTHER_STORY = 'components-button--secondary';
const SETTINGS = { requiredMatches: 3, minScreenshotsCount: 6, intervalMs: 500, timeoutMs: 20000 };

describe('the relay hands the restart a story to land on, from whichever side asked for it first', () => {
  it('carries the story when the tool was already waiting and the app arrives not yet in testing mode', () => {
    const { middleware } = createCaptureSocket();

    // An app has to have connected at least once before the tool is anything but "no-app" - a prior
    // PUT that carries an answer resolves immediately and holds nothing, which is enough for that.
    middleware(
      fakePut({ mode: 'default', stories: [STORY], answer: { kind: 'captured' } }),
      fakeRes(),
      noop
    );

    // The tool asks first. Nothing is holding an app yet, so this POST just waits.
    middleware(fakePost({ storyId: STORY, settings: SETTINGS }), fakeRes(), noop);

    // Now the app arrives, not in testing mode - this is the PUT that finds a tool already waiting.
    const appRes = fakeRes();
    middleware(fakePut({ mode: 'default', stories: [STORY], answer: null }), appRes, noop);

    expect(appRes.json()).toEqual({ restartIntoTesting: true, storyId: STORY });
  });

  it('carries the story when the app was already held and the tool arrives not yet in testing mode', () => {
    const { middleware } = createCaptureSocket();

    // The app arrives first and holds, waiting for a capture.
    const appRes = fakeRes();
    middleware(fakePut({ mode: 'default', stories: [STORY], answer: null }), appRes, noop);

    // The tool's POST finds that held app directly - the other branch that reaches the same
    // restart instruction.
    middleware(fakePost({ storyId: STORY, settings: SETTINGS }), fakeRes(), noop);

    expect(appRes.json()).toEqual({ restartIntoTesting: true, storyId: STORY });
  });

  it('carries no story when the app is already in testing mode - there is nothing to restart into', () => {
    const { middleware } = createCaptureSocket();

    middleware(
      fakePut({ mode: 'default', stories: [STORY], answer: { kind: 'captured' } }),
      fakeRes(),
      noop
    );

    const appRes = fakeRes();
    middleware(fakePut({ mode: 'testing', stories: [STORY], answer: null }), appRes, noop);
    middleware(fakePost({ storyId: STORY, settings: SETTINGS }), fakeRes(), noop);

    expect(appRes.json()).toEqual({ storyId: STORY, settings: SETTINGS });
  });
});

describe('a capture of an app that cannot list its stories', () => {
  it('a capture of an app that cannot list its stories is checked after the restart', () => {
    const { middleware } = createCaptureSocket();

    // The app shows itself and cannot list its stories (null, not []). It holds.
    const appRes = fakeRes();
    middleware(fakePut({ mode: 'default', stories: null, answer: null }), appRes, noop);

    // The tool asks: the story cannot be checked yet, so the app is told to restart with it.
    const toolRes = fakeRes();
    middleware(fakePost({ storyId: STORY, settings: SETTINGS }), toolRes, noop);
    expect(appRes.json()).toEqual({ restartIntoTesting: true, storyId: STORY });

    // The app is back in testing mode, lists its stories, and the story is not among them.
    const backRes = fakeRes();
    middleware(fakePut({ mode: 'testing', stories: [OTHER_STORY], answer: null }), backRes, noop);

    expect(toolRes.json()).toEqual({ kind: 'no-such-story', known: [OTHER_STORY] });
  });

  it('CONTROL: an app that lists no stories at all still gets no-such-story at once', () => {
    const { middleware } = createCaptureSocket();

    middleware(fakePut({ mode: 'default', stories: [], answer: null }), fakeRes(), noop);

    const toolRes = fakeRes();
    middleware(fakePost({ storyId: STORY, settings: SETTINGS }), toolRes, noop);

    expect(toolRes.json()).toEqual({ kind: 'no-such-story', known: [] });
  });
});

/* ========================================================================== */

/** A PUT from the app. */
function fakePut(body: unknown) {
  return fakeRequest('PUT', '/sherlo/capture', body);
}

/** A POST from the tool. */
function fakePost(body: unknown) {
  return fakeRequest('POST', '/sherlo/capture', body);
}
