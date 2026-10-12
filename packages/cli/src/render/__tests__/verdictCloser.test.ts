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
 *
 * ------------------------------------------------------------------------
 * COLOUR IS OFF IN HERE, AND THAT IS THE DIVISION OF LABOUR. This file asks WHICH lines the
 * closer makes and WHAT WORDS they carry. The exact bytes - every escape, every style boundary -
 * are pinned next door in renderLayerLiterals.test.ts, which renders the same segment through the
 * shipped `renderSegment` at `chalk.level = 1`. Asserting escapes here as well would be one
 * behaviour pinned twice, and the second copy is the one that rots.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderVerdictReviewRequired } from '../verdictCloser';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

/** The tally a build carries alongside its screens - what the closer falls back to. */
const SOME_COUNTS = { unreviewed: 2, reported: 1 };

describe('the verdict closer of a wait that ended needing review', () => {
  it('a wait that ends needing review names the screens that need one', () => {
    // Unreviewed, reported and errored screens by name - those are the ones a person has to act
    // on, and a name is what lets them act without running a second command.
    const lines = renderVerdictReviewRequired(
      [
        { name: 'Storefront - ProductCard', status: 'changed' },
        { name: 'Storefront - Banner', status: 'new' },
        { name: 'Typography - Scales', status: 'review-required' },
        { name: 'Storefront - Checkout', status: 'rejected' },
        { name: 'Storefront - Cart', status: 'error' },
        { name: 'Storefront - Footer', status: 'unchanged' },
      ],
      SOME_COUNTS
    );

    expect(lines).toEqual([
      '⚠️  Build finished with changes requiring review.',
      '   unreviewed: Storefront - ProductCard',
      '   unreviewed: Storefront - Banner',
      '   unreviewed: Typography - Scales',
      '   reported: Storefront - Checkout',
      '   errored: Storefront - Cart',
      '   1 more settled - approved, unchanged or inherited.',
    ]);
  });

  it('the settled screens are a count, however many there are', () => {
    // Approved and unchanged screens stay a number, the way the closer says them today. A project
    // with a hundred screens must not end every push with a hundred lines.
    const settled = Array.from({ length: 100 }, (_, index) => ({
      name: `Settled - Screen ${index}`,
      status: index % 2 === 0 ? 'unchanged' : 'approved',
    }));

    const lines = renderVerdictReviewRequired(
      [{ name: 'Storefront - ProductCard', status: 'changed' }, ...settled],
      SOME_COUNTS
    );

    expect(lines).toEqual([
      '⚠️  Build finished with changes requiring review.',
      '   unreviewed: Storefront - ProductCard',
      '   100 more settled - approved, unchanged or inherited.',
    ]);
    // Said as a number and NOT as a hundred names - the property the case is named for, asserted
    // where the list above could only have been read as one example of it.
    expect(lines.some((line) => line.includes('Settled - Screen'))).toBe(false);
  });

  it('a build whose screens the wait never learned prints the counts it always did', () => {
    // An older backend, or a status read that came back without the rows: the new words are an
    // improvement on having the data, never a requirement to have it.
    expect(renderVerdictReviewRequired(undefined, SOME_COUNTS)).toEqual([
      '⚠️  Build finished with changes requiring review.',
      '   2 story/stories unreviewed.',
      '   1 story/stories reported.',
    ]);

    // Each count line is printed only for a non-zero count, exactly as it always was.
    expect(renderVerdictReviewRequired(undefined, { unreviewed: 3, reported: 0 })).toEqual([
      '⚠️  Build finished with changes requiring review.',
      '   3 story/stories unreviewed.',
    ]);

    // And a build whose rows arrived but name NOBODY says less than its own tally does, so it
    // falls back to the same two lines rather than to a headline standing on its own.
    expect(
      renderVerdictReviewRequired(
        [{ name: 'Storefront - Footer', status: 'approved' }],
        SOME_COUNTS
      )
    ).toEqual([
      '⚠️  Build finished with changes requiring review.',
      '   2 story/stories unreviewed.',
      '   1 story/stories reported.',
    ]);
  });

  it('a build with more screens needing a person than the closer names says how many more', () => {
    // The cap is the whole judgment of this closer: `--wait` is the common path in CI, so the
    // block stays a block. What it must never do is drop the overflow silently.
    const needAPerson = Array.from({ length: 13 }, (_, index) => ({
      name: `Storefront - Screen ${index}`,
      status: 'changed',
    }));

    const lines = renderVerdictReviewRequired(needAPerson, { unreviewed: 13, reported: 0 });

    expect(lines).toEqual([
      '⚠️  Build finished with changes requiring review.',
      ...Array.from({ length: 10 }, (_, index) => `   unreviewed: Storefront - Screen ${index}`),
      '   ... and 3 more needing review.',
    ]);
  });

  it('a screen whose status this CLI has not learned is named under that status, not dropped', () => {
    // The wire may grow a status before this closer does. Naming it under its own spelling keeps
    // a screen a person might have to act on visible; silently counting it as settled would not.
    const lines = renderVerdictReviewRequired(
      [
        { name: 'Storefront - Kiosk', status: 'quarantined' },
        { name: 'Storefront - Footer', status: 'not-captured' },
      ],
      { unreviewed: 1, reported: 0 }
    );

    expect(lines).toEqual([
      '⚠️  Build finished with changes requiring review.',
      '   quarantined: Storefront - Kiosk',
      '   1 more settled - approved, unchanged or inherited.',
    ]);
  });
});
