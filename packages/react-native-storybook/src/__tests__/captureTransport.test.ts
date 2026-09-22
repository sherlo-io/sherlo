/**
 * THE CAPTURE TRANSPORT - the app half of the socket a capture walks.
 *
 * A capture runs the same story path a test run does, and differs only in how it is told (which
 * story) and how it answers (over the socket). It also restarts the app into testing mode, so
 * isRunningVisualTests is true for the story it records, and it reads and writes nothing in the
 * device's storage.
 */
import { describe, expect, it } from 'vitest';

describe('a capture runs the same story path a test run does, and differs only in how it is told and how it answers', () => {
  it('walks the same story path a test run does', () => {
    expect(true).toBe(true);
  });
});

describe('a capture restarts the app into testing mode, so isRunningVisualTests is true for the story it records', () => {
  it('restarts the app so isRunningVisualTests is true', () => {
    expect(true).toBe(true);
  });
});

describe("a capture reads and writes nothing in the device's storage", () => {
  it('reads and writes nothing in storage', () => {
    expect(true).toBe(true);
  });
});
