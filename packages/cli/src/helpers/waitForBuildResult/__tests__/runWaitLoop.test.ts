import { afterEach, describe, expect, it } from 'vitest';
import runWaitLoop from '../runWaitLoop';
import { WAIT_TIMEOUT_MINUTES } from '../constants';
import { BuildStatusSource } from '../types';

const neverPolls: BuildStatusSource = {
  poll: () => new Promise(() => {}), // must never resolve - the deadline check runs before any poll
};

afterEach(() => {
  process.exitCode = undefined;
});

/**
 * Call-counted clock stub: first call is the deadline computation, every
 * later call is the loop's deadline check. Passed in directly instead of
 * spying on the global `Date.now`, so no other `Date.now` caller in the
 * process (e.g. a test reporter timestamping console output) can perturb it.
 */
function makeClockStub(firstCallMs: number, laterCallsMs: number): () => number {
  let callCount = 0;
  return () => (callCount++ === 0 ? firstCallMs : laterCallsMs);
}

describe('runWaitLoop - deadline honors --maxWaitTime override', () => {
  it('times out after WAIT_TIMEOUT_MINUTES when no override is passed', async () => {
    const now = makeClockStub(0, WAIT_TIMEOUT_MINUTES * 60_000); // deadline = 0 + WAIT_TIMEOUT_MINUTES * 60_000

    await runWaitLoop({ statusSource: neverPolls, url: 'https://example.com', now });

    expect(process.exitCode).toBe(3);
  });

  it('honors a non-default maxWaitTimeMinutes for the deadline', async () => {
    const customMinutes = 2;
    const now = makeClockStub(0, customMinutes * 60_000); // deadline = 0 + customMinutes * 60_000

    await runWaitLoop({
      statusSource: neverPolls,
      url: 'https://example.com',
      maxWaitTimeMinutes: customMinutes,
      now,
    });

    expect(process.exitCode).toBe(3);
  });

  it('does NOT time out at the custom-minutes mark when it is still under the default deadline', async () => {
    const now = makeClockStub(0, 2 * 60_000); // deadline = 0 + WAIT_TIMEOUT_MINUTES * 60_000 (default), well before it

    const statusSource: BuildStatusSource = {
      poll: () => Promise.resolve({ terminal: true, hasChangesToReview: false }),
    };

    await runWaitLoop({ statusSource, url: 'https://example.com', now });

    // Reached the poll (and resolved terminal) instead of timing out.
    expect(process.exitCode).toBe(0);
  });
});
