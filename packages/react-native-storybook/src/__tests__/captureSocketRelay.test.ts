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

const STORY = 'components-button--primary';
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

/* ========================================================================== */

function noop(): void {}

/** A PUT from the app, body read synchronously - the relay reads it inline, no real stream needed. */
function fakePut(body: unknown) {
  return fakeRequest('PUT', body);
}

/** A POST from the tool, body read synchronously - same reasoning as fakePut. */
function fakePost(body: unknown) {
  return fakeRequest('POST', body);
}

function fakeRequest(method: string, body: unknown) {
  const bytes = Buffer.from(JSON.stringify(body));
  return {
    method,
    url: '/sherlo/capture',
    on(event: string, listener: (...args: unknown[]) => void) {
      // readJsonBody registers 'data' then 'end' synchronously and reads the body inline - firing
      // both here, in the same tick, reproduces that without a real stream.
      if (event === 'data') listener(bytes);
      if (event === 'end') listener();
    },
  };
}

/** A response that records what was written to it, and can hand the parsed JSON back to a test. */
function fakeRes() {
  let written: string | undefined;
  return {
    on() {
      // No test here closes a connection mid-hold; the relay's own close handling is untouched.
    },
    writeHead() {},
    end(body: string) {
      written = body;
    },
    json(): unknown {
      if (written === undefined) throw new Error('nothing was written to this response yet');
      return JSON.parse(written);
    },
  };
}
