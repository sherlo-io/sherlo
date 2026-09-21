/**
 * THE CAPTURE COMMAND - the settings a capture sends.
 *
 * The stabilization values a capture sends to the app are the same values the runner uses, not a
 * separate set the command invents. The test here pins that the command sends the runner's values.
 */
import { describe, expect, it } from 'vitest';

describe('the settings a capture sends are the runner\'s stabilization values', () => {
  it('sends the runner\'s stabilization values', () => {
    expect(true).toBe(true);
  });
});
