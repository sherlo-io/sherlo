/**
 * THE RATCHET, for the PREFLIGHT REFUSAL family (F3) - the CLI's validation and
 * refusal outputs.
 *
 * Every scenario in the catalog must render BYTE-IDENTICALLY to a screen the POSE CATALOGUE
 * commits (`packages/cli/poses/test/refusal-*.txt`). Nothing here regenerates a screen from a
 * formula; the committed bytes ARE the evidence, and they are what the SHIPPED COMMAND printed
 * for that pose, reviewed into git through whichever PR touches them.
 *
 * ==========================================================================
 * WHAT CHANGED WHEN THE SCREENS BECAME THE POSE CATALOGUE'S, AND WHY IT MATTERS
 * ==========================================================================
 *
 * This file used to compare `renderEmittedStdout(id)` against five `.txt` files minted from
 * `renderEmittedStdout` itself - a producer agreeing with its own past output. It now compares
 * the same function against a screen produced by running the WHOLE command through the shipped
 * routing (`sherlo pose`), against a project folder laid out from a declared world.
 *
 * So each case below is now a claim about TWO INDEPENDENT ROADS agreeing: the guard-called-by-
 * hand road and the run-the-command road print the same bytes, intro included. Six of the seven
 * scenarios do; the seventh is in `UNBOUND_SCENARIOS` with what differs and why.
 *
 * ==========================================================================
 * WHY THIS FAMILY WAS ALIGNED, NOT MIGRATED ONTO THE SEGMENT/SINK LAYER
 * ==========================================================================
 *
 * F5 (dry-run) and F1 (push) each needed a render layer EXTRACTED, because each
 * assembled a whole screen inside a command: literals were interleaved with
 * decisions, so proving the bytes meant first separating them. That extraction is
 * what `render/segments.ts` and `render/pushSpine.ts` are.
 *
 * A preflight refusal has no such tangle to undo. It is one guard's thrown
 * message, formatted by the one shared error formatter, with no parallel print
 * path anywhere in the CLI - `emitExpectation.ts` calls the SAME guard export the
 * live command path calls, with a synthetic input built to fail in exactly one
 * way. The "one render layer, two callers" shape the program is after is
 * therefore ALREADY the shape here; it simply arrived by a different road.
 *
 * ==========================================================================
 * ONE REPOSITORY, ONE FIXTURE - NO CROSS-REPO PATHS (operator ruling,
 * sherlo#265 review, 2026-09-15)
 * ==========================================================================
 *
 * This file also used to open sherlo-tester's committed baselines by path and
 * compare against them (marked `.fails` while they were known-stale after
 * cli-emit-expectation-whole-screen taught `renderEmittedStdout` to render the
 * whole refusal screen, not the guard's message alone). That is gone: a
 * repository must not read another repository's files by path, and a
 * `.fails` wrap is a trap, not a ratchet - the day sherlo-tester re-mints its
 * baselines, that comparison starts unexpectedly PASSING, which under
 * `.fails` reds the NEXT CLI run that clones sherlo-tester's matching branch,
 * for a reason nobody watching this repo caused.
 *
 * So the ratchet below proves exactly one thing, unconditionally, needing no
 * checkout of anything but this repository: `renderEmittedStdout(id)` matches
 * the fixture this repo commits for `id`. Sherlo-tester's own story run is the
 * separate proof that ITS committed panes match what this CLI prints; see
 * `preflight.refusals.ts`'s header for where that proof lives instead.
 *
 * ==========================================================================
 * THIS FAMILY IS ANSI-PRESERVING
 * ==========================================================================
 *
 * The screens below are captured WITH colour - a hoisted newline, a moved
 * style boundary or whitespace inside a styled span moves real escape bytes,
 * and the comparison below sees them. The boxed panel in `binary-path-missing`
 * is the sharpest case - its rows pad with spaces INSIDE
 * `\x1b[34m\x1b[2m...\x1b[22m\x1b[39m` runs. The case at the bottom
 * asserts that property rather than assuming it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { EXPECTATION_SCENARIO_IDS, renderEmittedStdout } from '../emitExpectation';
import { POSES_ROOT } from '../../pose/catalogue';
import {
  PREFLIGHT_REFUSALS,
  PREFLIGHT_REFUSAL_IDS,
  UNBOUND_SCENARIOS,
} from '../preflight.refusals';

/** Where a pose's committed screen lives, from the name the catalogue knows it by. */
function screenPathOf(posedScreen: string): string {
  return path.join(POSES_ROOT, `${posedScreen}.txt`);
}

/**
 * The bytes the shipped command printed for a pose.
 *
 * The committed screen carries the run's EXIT CODE on a line of its own - the pose catalogue's
 * own addition, so a screen that stayed the same while its exit code changed is a visible diff.
 * The emit road prints no such line, so it is taken off before the comparison; the exit code is
 * ratcheted by the pose catalogue's own law, not twice.
 */
function posedScreen(name: string): string {
  return fs.readFileSync(screenPathOf(name), 'utf8').replace(/\n\[exit \d+\]\n$/, '');
}

/**
 * Colour is pinned ON, once, before anything renders. The refusal formatter bakes
 * chalk into its output at call time, and the fixtures were minted with colour
 * forced - a level set later, or not at all, would render uncoloured bytes and red
 * every case below for the wrong reason.
 */
chalk.level = 1;

describe('the preflight refusal catalog', () => {
  it('has scenarios (an emptied catalog would pass every case below by covering nothing)', () => {
    expect(PREFLIGHT_REFUSAL_IDS.length).toBeGreaterThan(0);
  });

  it('every scenario declares a description and a pose whose screen is committed', () => {
    const unstated: string[] = [];
    for (const [id, scenario] of Object.entries(PREFLIGHT_REFUSALS)) {
      if (!scenario.description.trim()) unstated.push(`${id} - empty description`);
      if (!fs.existsSync(screenPathOf(scenario.posedScreen))) {
        unstated.push(`${id} - no committed screen for pose "${scenario.posedScreen}"`);
      }
    }
    expect(unstated).toEqual([]);
  });

  it('every emit scenario is either bound to a fixture or listed as unbound, with a reason', () => {
    // THE TOTALITY GATE. Without it, the cheapest way to green a failing scenario
    // would be to delete its catalog entry - the family would shrink silently and
    // every count above would still look healthy. A scenario must be accounted
    // for in one of the two lists, never in neither.
    const unaccounted = EXPECTATION_SCENARIO_IDS.filter(
      (id) => !(id in PREFLIGHT_REFUSALS) && !(id in UNBOUND_SCENARIOS)
    );
    expect(
      unaccounted,
      'an --emit-expectation scenario is neither ratcheted against a committed fixture nor ' +
        'recorded in UNBOUND_SCENARIOS with the reason it cannot be. Add it to one or the other.'
    ).toEqual([]);
  });

  it('nothing is both bound and listed as unbound, and every unbound id still exists', () => {
    // The mirror check: a stale UNBOUND_SCENARIOS entry is a documented gap that
    // is no longer a gap, and should be deleted rather than quietly excusing a
    // scenario that is now proved (or one that no longer exists at all).
    const both = PREFLIGHT_REFUSAL_IDS.filter((id) => id in UNBOUND_SCENARIOS);
    expect(both, 'a scenario is both ratcheted and excused').toEqual([]);

    const vanished = Object.keys(UNBOUND_SCENARIOS).filter(
      (id) => !EXPECTATION_SCENARIO_IDS.includes(id)
    );
    expect(vanished, 'UNBOUND_SCENARIOS names a scenario the CLI no longer has').toEqual([]);
  });

  for (const id of PREFLIGHT_REFUSAL_IDS) {
    const { posedScreen: poseName } = PREFLIGHT_REFUSALS[id];

    it(`${id}: renders every byte the command prints for ${poseName}`, () => {
      expect(
        renderEmittedStdout(id),
        'THE TWO ROADS NO LONGER AGREE. The screen this is compared against is what the ' +
          'SHIPPED COMMAND printed for that pose, reviewed into git by a person; a divergence ' +
          'means one of the two roads changed what a real user reads - its wording, its ' +
          'colour, its blank lines or its box. That is a product change to argue for, not a ' +
          'file to re-record: if the new text is intended, re-mint the pose catalogue in the ' +
          'same PR and say so.'
      ).toBe(posedScreen(poseName));
    });
  }

  it('renders the same bytes twice', () => {
    // Determinism, not truth - a producer agrees with itself by construction.
    // What this catches is a clock, a counter or an environment read leaking onto
    // the refusal path, which would make the fixtures unmintable rather than wrong.
    for (const id of PREFLIGHT_REFUSAL_IDS) {
      expect(renderEmittedStdout(id)).toBe(renderEmittedStdout(id));
    }
  });

  it('CONTROL: a corrupted render is REJECTED (the comparison still rejects what it should)', () => {
    const id = PREFLIGHT_REFUSAL_IDS[0];
    // One byte. Without this case a comparison that had degenerated into
    // `expect(x).toBe(x)` would look exactly as green as a real proof.
    expect(`${renderEmittedStdout(id)} `).not.toBe(posedScreen(PREFLIGHT_REFUSALS[id].posedScreen));
  });

  it('the enforced fixtures KEEP colour, so the comparison above is NOT blind to chalk boundaries', () => {
    // The load-bearing property of this family, asserted rather than assumed.
    // If a fixture were ever re-minted through a stripping masker, every case
    // above would keep passing while going blind to every colour and
    // style-boundary change - and nothing else would say so.
    // eslint-disable-next-line no-control-regex
    const ansi = /\x1b\[[0-9;]*m/g;
    const colourless = PREFLIGHT_REFUSAL_IDS.filter(
      (id) => (posedScreen(PREFLIGHT_REFUSALS[id].posedScreen).match(ansi) ?? []).length === 0
    );
    expect(
      colourless,
      'an enforced refusal screen carries no ANSI - this family is supposed to preserve it, ' +
        'and a stripped baseline would make the byte ratchet blind to the chalk class'
    ).toEqual([]);
  });

  it('a fixture carries the sherlo intro exactly where the live road prints one', () => {
    // The byte comparisons above would catch a missing (or a doubled) intro as a
    // diff, but only as a diff - this says in words what the fixtures hold, so a
    // re-mint that quietly dropped the wordmark is read as the product change it
    // is. `token-malformed` refuses inside `stagedRun`, which prints the intro
    // first; `config-missing` refuses while `test.ts` is still reading the config
    // file, with nothing yet on screen. Checked on the stripped text because the
    // gradient colours the wordmark one character at a time.
    // eslint-disable-next-line no-control-regex
    const stripAnsi = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, '');
    const wordmarkLastRow = '\'88888P\' 888  888  "Y8888  888     888  "Y88P"';

    const introCarrying = stripAnsi(posedScreen('test/refusal-token-malformed'));
    expect(introCarrying.split(wordmarkLastRow).length - 1).toBe(1);

    const introLess = stripAnsi(posedScreen('test/refusal-config-missing'));
    expect(introLess).not.toContain(wordmarkLastRow);
    expect(introLess.startsWith('ERROR:')).toBe(true);
  });

  it('the boxed refusal pads INSIDE its styled spans, so whitespace changes there are caught', () => {
    // The sharpest instance of the property above, pinned by name. The
    // "Preview Simulator Build" panel aligns its rows with spaces that sit
    // between a style-open and its close - the exact shape a stripping masker
    // renders invisible.
    const boxed = posedScreen(PREFLIGHT_REFUSALS['binary-path-missing'].posedScreen);
    expect(boxed).toContain('\x1b[34m\x1b[2m│\x1b[22m\x1b[39m ');
    expect(boxed).toContain('\x1b[1mpreview simulator build\x1b[22m');
  });
});
