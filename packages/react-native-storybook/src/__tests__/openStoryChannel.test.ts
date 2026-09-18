/**
 * THE LETTERBOX ON THE BUNDLER - the road something outside a running app tells the SDK which story
 * to show.
 *
 * WHAT THESE FOUR HOLD, and why they are worth holding. The first two are the road itself: a story
 * posted at the bundler's address reaches whichever app is waiting, and the app answers back at the
 * same address once the story is painted - which is what lets `sherlo open --wait` make an
 * end-to-end claim rather than report a message sent. The third is the one that is easy to get
 * wrong: the letterbox REMEMBERS the story it was last given rather than relaying it, because
 * reaching the story browser costs a restart and a relay would drop the ask on the floor. The
 * fourth says the road is live rather than launch-time - the story on screen is replaced where it
 * stands.
 *
 * SHELLS. The letterbox itself is this epic's first task; these say what it will have to do, in the
 * words the book uses for it (sherlo / Opening one story from outside). A shell is a named promise,
 * not a passing test, so each one fails until the thing it names exists.
 */
import { describe, it } from 'vitest';

describe('the letterbox on the bundler', () => {
  it.todo('a waiting app is handed the story the command posted');

  it.todo('the app answers over the same address once the story is painted');

  it.todo('a story posted before any app is listening is delivered when one connects');

  it.todo('a story asked for from outside replaces the one on screen without a restart');
});
