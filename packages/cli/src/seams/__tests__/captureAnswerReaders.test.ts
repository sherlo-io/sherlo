/**
 * THE CAPTURE ANSWER READERS - `captureAnswerReaders.ts` reads the small fields of a capture answer
 * off the wire and answers nothing for what an older app does not send.
 */
import { describe, expect, it } from 'vitest';
import { readParts, readRoot, readSettled, readWaited } from '../captureAnswerReaders';

describe('reading the small fields of a capture answer', () => {
  it('reads how the story settled, and calls anything unreadable timed out', () => {
    expect(readSettled({ ms: 1400, frames: 6 })).toEqual({ ms: 1400, frames: 6 });
    expect(readSettled('timed-out')).toBe('timed-out');
    expect(readSettled({ ms: 'soon' })).toBe('timed-out');
  });

  it('reads the number of screenfuls, and nothing for what is not a number', () => {
    expect(readParts(3)).toBe(3);
    expect(readParts('3')).toBeUndefined();
  });

  it('reads both waits or neither', () => {
    const metadata = { outcome: 'polled', ms: 40 };
    const storyViews = { outcome: 'first-check', ms: 1, rereads: 2 };
    expect(readWaited({ metadata, storyViews })).toEqual({ metadata, storyViews });
    expect(readWaited({ metadata })).toBeUndefined();
  });

  it('reads what the tree is rooted at, and nothing for an unknown root', () => {
    expect(readRoot({ at: 'story', nodeCount: 4 })).toEqual({ at: 'story', nodeCount: 4 });
    expect(readRoot({ at: 'sky', nodeCount: 4 })).toBeUndefined();
  });
});
