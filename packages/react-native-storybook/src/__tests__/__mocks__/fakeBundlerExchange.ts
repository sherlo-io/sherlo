/**
 * THE REQUEST AND RESPONSE DOUBLES the metro middleware tests share (the letterbox, the capture
 * relay and the capture log feed): no real HTTP socket, no bundler.
 */

export function noop(): void {}

/** A request whose body is read synchronously - the middleware reads it inline, no stream needed. */
export function fakeRequest(method: string, url: string, body?: unknown) {
  const bytes = Buffer.from(JSON.stringify(body ?? {}));
  return {
    method,
    url,
    on(event: string, listener: (...args: unknown[]) => void) {
      // readJsonBody registers 'data' then 'end' synchronously - firing both here, in the same
      // tick, reproduces that.
      if (event === 'data') listener(bytes);
      if (event === 'end') listener();
    },
  };
}

/** A response that records what was written to it, and can hand the parsed JSON back to a test. */
export function fakeRes() {
  let written: string | undefined;
  return {
    on() {
      // No test here closes a connection mid-hold.
    },
    writeHead() {},
    end(body: string) {
      written = body;
    },
    written(): boolean {
      return written !== undefined;
    },
    json(): unknown {
      if (written === undefined) throw new Error('nothing was written to this response yet');
      return JSON.parse(written);
    },
  };
}
