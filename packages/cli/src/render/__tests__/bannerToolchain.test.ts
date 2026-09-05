/**
 * THE BANNER TOOLCHAIN PIN - the biggest unguarded drift surface in this tree,
 * and the one nothing else can see.
 *
 * THE HAZARD, PRECISELY. The sherlo wordmark is not literal text. It is run
 * through `gradientString(...)`, which emits an SGR PAIR AROUND EVERY SINGLE
 * CHARACTER - which is why `comparison-first-push-...txt` lines 2-9 read as
 * hundreds of `ESC[93m8ESC[39m` sequences rather than as ASCII art. Thirty-one
 * committed push fixtures carry those bytes, and `maskPushOutput` PRESERVES
 * colour, so a `gradient-string` minor bump - or a `chalk` major, which changes
 * how styles nest - silently rewrites the first ten lines of every one of them
 * while changing nothing a human would call a product change.
 *
 * WHAT MAKES THIS DIFFERENT FROM AN ORDINARY DEPENDENCY BUMP is that the remedy
 * is not "fix the code". There is nothing to fix: the transcript is correct
 * before and after. The remedy is to re-mint thirty-one baselines through a real
 * device run. So the bump has to be seen BEFORE it lands, not discovered by a
 * dispatch three weeks later, and it has to red with a sentence that says what
 * it costs.
 *
 * IT PINS THE RESOLVED VERSION, NOT THE RANGE. `package.json` declares
 * `^2.0.1`; the range is what ALLOWS the drift, so asserting it would pass on
 * the very bump this exists to catch. What the fixtures were rendered under is
 * the resolved version, so that is what is pinned.
 *
 * WHY IT IS NOT ALSO A BYTE PIN OF THE WORDMARK. The gradient's exact colour
 * stops are the library's business, and pinning them here would mean copying
 * hundreds of escapes into a test file where nobody could review a change to
 * them. The pin below is the CAUSE; the fixtures are the effect, and the ratchet
 * is what compares them.
 */
import { describe, expect, it } from 'vitest';

/**
 * The versions the thirty-one committed push fixtures were rendered under.
 *
 * Bumping either of these is a deliberate act with a cost attached - update this
 * pin in the SAME commit as the re-mint, never before it.
 */
const RENDERED_UNDER = {
  'gradient-string': '2.0.2',
  chalk: '4.1.2',
};

const WHY: Record<string, string> = {
  'gradient-string':
    'the wordmark is emitted PER CHARACTER by gradient-string, so a version change rewrites ten ' +
    'lines of every push fixture in the tree',
  chalk:
    'chalk decides where a style opens and closes - including re-opening it on every line of a ' +
    'multi-line styled string, which is what makes a blank line inside a chalk call render as a ' +
    'STYLED empty line. A major bump moves those boundaries',
};

function resolvedVersion(packageName: string): string {
  return require(`${packageName}/package.json`).version as string;
}

describe('the banner toolchain is pinned to what the fixtures were rendered under', () => {
  it('pins at least one package (an emptied pin would pass by covering nothing)', () => {
    expect(Object.keys(RENDERED_UNDER).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(RENDERED_UNDER))('%s resolves to %s', (packageName, pinned) => {
    expect(
      resolvedVersion(packageName),
      `BANNER TOOLCHAIN DRIFT: the committed push fixtures were rendered with ${packageName} ` +
        `${pinned}; the CLI now resolves ${resolvedVersion(packageName)}.\n\n` +
        `  ${WHY[packageName]}.\n\n` +
        '  This is NOT fixed by editing the render layer - the transcript is correct before and ' +
        'after. Either pin the dependency back, or re-mint every push baseline through a real ' +
        'device run and update this pin in the same commit. A push fixture is RECORDED, so a ' +
        're-mint is an `update_baselines` dispatch, never a local edit.'
    ).toBe(pinned);
  });

  it('CONTROL: the reader returns a real version, so a typo in a package name reds', () => {
    // Without this, a renamed package would make `resolvedVersion` throw inside
    // the case above - which reads as a failure, correctly - but a reader that
    // silently returned `undefined` would make every case vacuously comparable
    // to `undefined`. Proving the reader works keeps the cases meaningful.
    expect(resolvedVersion('chalk')).toMatch(/^\d+\.\d+\.\d+/);
  });
});
