/**
 * A story freezes the clock to a moment and seeds random, so a screen that shows a date or a
 * shuffle shows the same thing every time (sherlo-brain, books/sherlo/mocking-a-story.md).
 */
import { describe, it } from 'vitest';

describe('the clock is frozen by the story', () => {
  it.todo('the clock reads the moment the story names');
  it.todo('a Date made with arguments is untouched; only now is frozen');
  it.todo('leaving the story restores the real clock');
});

describe('random is seeded by the story', () => {
  it.todo('random repeats the same sequence from the seed on every activation');
  it.todo('leaving the story restores the real random');
});

describe('the clock and random follow the story', () => {
  it.todo('neither is installed outside testing and storybook mode');
});
