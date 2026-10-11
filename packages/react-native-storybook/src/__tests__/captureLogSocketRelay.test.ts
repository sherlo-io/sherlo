/**
 * THE APP'S LIVE LOG FEED ON THE BUNDLER - the metro middleware half (see metro/captureLogSocket.js
 * and ../captureTransport.ts's live push). Driven directly against the middleware with minimal
 * request/response doubles, the same spirit as captureSocketRelay.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { createCaptureLogSocket } from '../../metro/captureLogSocket.js';
import { fakeRequest, fakeRes, noop } from './__mocks__/fakeBundlerExchange';

describe('a posted line lands in the feed for the next reader, and nowhere held open', () => {
  it('hands a reader every line posted so far, oldest first', () => {
    const { middleware } = createCaptureLogSocket();

    middleware(fakePost({ line: 'first line' }), fakeRes(), noop);
    middleware(fakePost({ line: 'second line' }), fakeRes(), noop);

    const readerRes = fakeRes();
    middleware(fakeGet(), readerRes, noop);

    expect(readerRes.json()).toEqual({ lines: ['first line', 'second line'] });
  });

  it('the feed is drained by a read, not merely peeked - a second read finds nothing left over', () => {
    const { middleware } = createCaptureLogSocket();

    middleware(fakePost({ line: 'only line' }), fakeRes(), noop);
    middleware(fakeGet(), fakeRes(), noop);

    const secondRead = fakeRes();
    middleware(fakeGet(), secondRead, noop);

    expect(secondRead.json()).toEqual({ lines: [] });
  });

  it('a reader before anything was ever posted finds an empty feed, not an error', () => {
    const { middleware } = createCaptureLogSocket();

    const readerRes = fakeRes();
    middleware(fakeGet(), readerRes, noop);

    expect(readerRes.json()).toEqual({ lines: [] });
  });

  it('the app is answered immediately, whether or not any reader is waiting - nothing here holds a POST open', () => {
    const { middleware } = createCaptureLogSocket();

    const posterRes = fakeRes();
    middleware(fakePost({ line: 'nobody is reading yet' }), posterRes, noop);

    expect(posterRes.json()).toEqual({});
  });

  it('drops the oldest lines once the cap is reached', () => {
    const { middleware } = createCaptureLogSocket({ maxLines: 2 });

    middleware(fakePost({ line: 'one' }), fakeRes(), noop);
    middleware(fakePost({ line: 'two' }), fakeRes(), noop);
    middleware(fakePost({ line: 'three' }), fakeRes(), noop);

    const readerRes = fakeRes();
    middleware(fakeGet(), readerRes, noop);

    expect(readerRes.json()).toEqual({ lines: ['two', 'three'] });
  });

  it('leaves any other path to the next middleware in the chain', () => {
    const { middleware } = createCaptureLogSocket();
    let reachedNext = false;

    middleware(fakeGet('/index.bundle?platform=ios'), fakeRes(), () => {
      reachedNext = true;
    });

    expect(reachedNext).toBe(true);
  });
});

/* ========================================================================== */

function fakePost(body: unknown) {
  return fakeRequest('POST', '/sherlo/capture-log', body);
}

function fakeGet(url = '/sherlo/capture-log') {
  return fakeRequest('GET', url);
}
