/**
 * `sherlo capture --json` prints the record the seam read off the app's answer. An error that
 * carries its component stack and stack comes back with both; the words the terminal prints stay
 * the name and message alone.
 */
import { describe, expect, it } from 'vitest';
import { readCaptureAnswer } from '../../seams/captureSocket';

const STORY = 'components-button--primary';

describe('a capture record tells the truth', () => {
  it('--json carries the component stack and top frames', () => {
    const stack = [
      'TypeError: x is undefined',
      ...[1, 2, 3, 4, 5, 6].map((n) => `    at fn${n} (app.js:${n}:1)`),
    ].join('\n');
    const componentStack = '\n    at Button\n    at Screen';

    const read = readCaptureAnswer(
      {
        kind: 'captured',
        storyId: STORY,
        settled: { ms: 10, frames: 3 },
        threw: { name: 'TypeError', message: 'x is undefined', stack, componentStack },
        tree: { tag: 'View', children: [] },
      },
      STORY
    );

    expect(read).toMatchObject({
      kind: 'captured',
      threw: {
        name: 'TypeError',
        message: 'x is undefined',
        componentStack,
        topFrames: [1, 2, 3, 4, 5].map((n) => `at fn${n} (app.js:${n}:1)`),
      },
    });
  });

  it('a crash carries its component stack too, and an error without them stays two fields', () => {
    const crashed = readCaptureAnswer(
      { kind: 'crashed', error: { name: 'E', message: 'm', componentStack: 'at A' } },
      STORY
    );
    const plain = readCaptureAnswer({ kind: 'crashed', error: { name: 'E', message: 'm' } }, STORY);

    expect(crashed).toEqual({
      kind: 'crashed',
      storyId: STORY,
      error: { name: 'E', message: 'm', componentStack: 'at A' },
    });
    expect(plain).toEqual({ kind: 'crashed', storyId: STORY, error: { name: 'E', message: 'm' } });
  });
});
