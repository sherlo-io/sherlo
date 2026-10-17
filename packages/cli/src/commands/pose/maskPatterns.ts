/**
 * The pieces every fold in `maskScreen.ts` builds its patterns from: how a screen spells its
 * colour escapes, and a word boundary that sees past them.
 */

/**
 * The escape byte every ANSI sequence on a screen starts with, spelled the way a pattern spells
 * it. SPELLED RATHER THAN TYPED: a raw control character sitting in this source would be
 * invisible to whoever read it next.
 */
export const ESCAPE = '\\u001b';

/** A whole colour escape, from its opening byte to the letter that closes it (`ESC[34m`). */
export const COLOR_ESCAPE = `${ESCAPE}\\[[0-9;?]*[A-Za-z]`;

/**
 * `\b`, made to see past a colour escape.
 *
 * `\b` is a transition between a word character and a non-word one, and a colour escape's own
 * closing byte IS a word character (`ESC[34m` ends in the letter `m`) - so the plain rule never
 * fires between that letter and the digit or letter of the value it was painted onto. Every class
 * below opens (and some close) right there, which is exactly where the tool prints its values, so
 * `\b` is replaced everywhere in the masker by one of these: true wherever `\b` was already true,
 * OR immediately after a colour escape has just ended (`ESCAPE_AWARE_BOUNDARY.before`), OR
 * immediately before one is about to start (`ESCAPE_AWARE_BOUNDARY.after`).
 */
export const ESCAPE_AWARE_BOUNDARY = {
  before: `(?:(?<![A-Za-z0-9_])|(?<=${COLOR_ESCAPE}))`,
  after: `(?:(?![A-Za-z0-9_])|(?=${COLOR_ESCAPE}))`,
};
