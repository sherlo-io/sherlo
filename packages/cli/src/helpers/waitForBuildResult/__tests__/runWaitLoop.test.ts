import { afterEach, describe, expect, it, vi } from 'vitest';
import runWaitLoop from '../runWaitLoop';
import { WAIT_TIMEOUT_MINUTES } from '../constants';
import { BuildStatusSource } from '../types';

const neverPolls: BuildStatusSource = {
  poll: () => new Promise(() => {}), // must never resolve - the deadline check runs before any poll
};

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('runWaitLoop - deadline honors --maxWaitTime override', () => {
  it('times out after WAIT_TIMEOUT_MINUTES when no override is passed', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(0); // deadline = 0 + WAIT_TIMEOUT_MINUTES * 60_000
    now.mockReturnValueOnce(WAIT_TIMEOUT_MINUTES * 60_000); // Date.now() >= deadline

    await runWaitLoop({ statusSource: neverPolls, url: 'https://example.com' });

    expect(process.exitCode).toBe(3);
  });

  it('honors a non-default maxWaitTimeMinutes for the deadline', async () => {
    const customMinutes = 2;
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(0); // deadline = 0 + customMinutes * 60_000
    now.mockReturnValueOnce(customMinutes * 60_000); // Date.now() >= deadline

    await runWaitLoop({
      statusSource: neverPolls,
      url: 'https://example.com',
      maxWaitTimeMinutes: customMinutes,
    });

    expect(process.exitCode).toBe(3);
  });

  it('does NOT time out at the custom-minutes mark when it is still under the default deadline', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(0); // deadline = 0 + WAIT_TIMEOUT_MINUTES * 60_000 (default)
    now.mockReturnValueOnce(2 * 60_000); // well before the default deadline

    const statusSource: BuildStatusSource = {
      poll: () => Promise.resolve({ terminal: true, hasChangesToReview: false }),
    };

    await runWaitLoop({ statusSource, url: 'https://example.com' });

    // Reached the poll (and resolved terminal) instead of timing out.
    expect(process.exitCode).toBe(0);
  });
});
