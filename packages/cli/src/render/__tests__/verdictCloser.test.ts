/**
 * THE CLOSER A WAIT ENDS ON, AND WHAT IT NAMES (epic git-is-a-beat, 2026-09-21).
 *
 * `sherlo test --wait` and `sherlo view` are meant to tell a developer the same thing about a
 * finished build (operator intent, 2026-09-21). They do not: the wait polls the build's status and
 * gets every screen back with its status and its baseline - the same data `view --metadata` renders
 * - then discards it and prints `1 story/stories unreviewed`. A developer who waited has to run a
 * second command to learn WHICH screen is waiting for them.
 *
 * SHELLS, WRITTEN IN PLAN. The names are the contract; the bodies are the builder's. The judgment
 * this task is really about is the second one: not printing a hundred lines at the end of every
 * push in CI, where `--wait` is the common path and `view` is the opt-in one.
 */
import { describe, it } from 'vitest';

describe('the verdict closer of a wait that ended needing review', () => {
  it('a wait that ends needing review names the screens that need one', () => {
    // Unreviewed, reported and errored screens by name - those are the ones a person has to act
    // on, and a name is what lets them act without running a second command.
  });

  it('the settled screens are a count, however many there are', () => {
    // Approved and unchanged screens stay a number, the way the closer says them today. A project
    // with a hundred screens must not end every push with a hundred lines.
  });

  it('a build whose screens the wait never learned prints the counts it always did', () => {
    // An older backend, or a status read that came back without the rows: the new words are an
    // improvement on having the data, never a requirement to have it.
  });
});
