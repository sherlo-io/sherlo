/**
 * THE RATCHET, for the PREFLIGHT REFUSAL family (F3) - the CLI's validation and
 * refusal outputs, at 8 committed fixtures across 5 suite locations.
 *
 * Every scenario in the catalog must render BYTE-IDENTICALLY to the fixture
 * already committed in sherlo-tester. Nothing here regenerates a fixture. The
 * committed bytes ARE the evidence.
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
 * So the two candidate costs are:
 *
 *   MIGRATE - decompose these refusals into segment kinds and route the shipped
 *   guards through the new layer. Cost: touching five shipped guards
 *   (validateToken, validateDevices, parseConfigFile, validatePlatformPaths,
 *   validateBinariesInfo) that sit on the CLI's most user-facing path, to invent
 *   a segment vocabulary for text that has exactly one producer already. Risk:
 *   the hard constraint is that nothing may change what a real user sees, and
 *   every byte here is a refusal a user reads when their run fails. Benefit:
 *   uniformity - one road instead of two.
 *
 *   ALIGN - leave the producing road alone and add the thing the family actually
 *   lacked. Cost: two roads to expected bytes rather than one. But that second
 *   road is not accidental drift: sherlo-tester's `MINTING_COMMANDS` already names
 *   both deliberately, with the distinction argued - `--emit-expectation` renders
 *   a guard's own thrown text, `--render-transcript` renders a whole transcript
 *   from scripted wire state. Both satisfy the doctrine's test (a person authored
 *   the input and would read the red); neither is a capture from the run being
 *   judged.
 *
 * ALIGN's cost is smaller, and the deciding fact is that migration buys ZERO
 * byte-level assurance: byte-identity against all 8 fixtures is achievable today,
 * against the code as shipped, and is what this file now enforces. Migration
 * would spend risk on live refusal text to purchase a uniformity the enforcement
 * layer does not need - the ratchet is what makes a family safe, and a ratchet
 * does not care which road produced the bytes it compares. What the family was
 * missing was never a layer. It was THIS FILE.
 *
 * WHAT PROVENANCE DID NOT COVER. These four directories have been inside
 * sherlo-tester's `MINTED_FIXTURE_DIRS` since s3cv-minted-expectations, so the
 * family already looked enforced. But that sweep checks only that a `.minted.json`
 * SIDECAR EXISTS naming a minting command - it never re-renders anything. A
 * sidecar says a fixture WAS minted once; it cannot notice that the CLI has since
 * stopped producing those bytes. `emitExpectation.test.ts` does not close that
 * either: it compares the minted text to a live guard call made IN THAT SAME FILE
 * with the same synthetic input, so it proves the one-formatter law and nothing
 * about the committed bytes - change a refusal's wording and it stays green while
 * every fixture in git goes stale. This file is the missing half.
 *
 * ==========================================================================
 * THIS FAMILY IS ANSI-PRESERVING WHERE IT IS ENFORCED
 * ==========================================================================
 *
 * The masker regime SPLITS here, and the split falls exactly along the exemption
 * line - which is why the enforced set has no blind spot:
 *
 *   - The 8 fixtures bound below capture through `maskPushOutput`, which PRESERVES
 *     colour (03-path-errors.spec.ts; the three cli-*-refusals chapters say so in
 *     their report-expectations.ts). So this ratchet is NOT blind to the chalk
 *     class: a hoisted newline, a moved style boundary or whitespace inside a
 *     styled span moves real escape bytes, and this comparison sees them. The
 *     boxed panel in `binary-path-missing` is the sharpest case - its rows pad
 *     with spaces INSIDE `\u001b[34m\u001b[2m...\u001b[22m\u001b[39m` runs.
 *   - The 2 fixtures NOT bound (04-abi-preflight, the Expo ABI pair) capture
 *     through `stripAnsi`, and are ANSI-blind. They are also exactly the two
 *     already exempt in sherlo-tester, for an unrelated reason (wrong hint
 *     branch). So no fixture is both enforced and colour-blind.
 *
 * The consequence for coverage: where the dry-run family leans on the literal pin
 * (`render/__tests__/renderLayerLiterals.test.ts`) as its ONLY cover for the chalk
 * class, this family does not - the byte ratchet below covers it directly, and the
 * case at the bottom asserts that property rather than assuming it.
 */
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { EXPECTATION_SCENARIO_IDS, renderEmittedStdout } from '../emitExpectation';
import {
  PREFLIGHT_REFUSALS,
  PREFLIGHT_REFUSAL_IDS,
  UNBOUND_SCENARIOS,
} from '../preflight.refusals';
import {
  TESTER_AVAILABLE,
  committedFixture,
  declareTesterCheckoutGate,
  fixtureExists,
} from './testerCheckout';

/**
 * Colour is pinned ON, once, before anything renders. The refusal formatter bakes
 * chalk into its output at call time, and the fixtures were minted with colour
 * forced - a level set later, or not at all, would render uncoloured bytes and red
 * every case below for the wrong reason.
 */
chalk.level = 1;

/** Every (scenario, fixture) pair the ratchet must prove - the flattened catalog. */
function everyBoundPair(): { id: string; fixture: string }[] {
  return PREFLIGHT_REFUSAL_IDS.flatMap((id) =>
    PREFLIGHT_REFUSALS[id].fixtures.map((fixture) => ({ id, fixture }))
  );
}

describe('the preflight refusal catalog', () => {
  declareTesterCheckoutGate();

  it('has scenarios (an emptied catalog would pass every case below by covering nothing)', () => {
    expect(PREFLIGHT_REFUSAL_IDS.length).toBeGreaterThan(0);
    expect(everyBoundPair().length).toBeGreaterThan(0);
  });

  it('every scenario declares a description and only `.txt` fixtures', () => {
    const unstated: string[] = [];
    for (const [id, scenario] of Object.entries(PREFLIGHT_REFUSALS)) {
      if (!scenario.description.trim()) unstated.push(`${id} - empty description`);
      if (scenario.fixtures.length === 0) unstated.push(`${id} - answers for no fixture`);
      for (const fixture of scenario.fixtures) {
        if (!fixture.endsWith('.txt')) unstated.push(`${id} - ${fixture} is not a .txt path`);
      }
    }
    expect(unstated).toEqual([]);
  });

  it('no two scenarios answer for the same fixture', () => {
    // A duplicated fixture path would mean one committed baseline is proved twice
    // and another not at all, while the counts above still looked right.
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const { id, fixture } of everyBoundPair()) {
      const previous = seen.get(fixture);
      if (previous) duplicates.push(`${fixture} - both ${previous} and ${id}`);
      else seen.set(fixture, id);
    }
    expect(duplicates).toEqual([]);
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

  it.runIf(TESTER_AVAILABLE)('every bound fixture exists', () => {
    const missing = everyBoundPair()
      .filter(({ fixture }) => !fixtureExists(fixture))
      .map(({ id, fixture }) => `${id} -> ${fixture}`);
    expect(missing, 'a scenario answers for a fixture that is not in the tree').toEqual([]);
  });

  for (const { id, fixture } of everyBoundPair()) {
    it.runIf(TESTER_AVAILABLE)(`${id}: renders every byte of ${path.basename(fixture)}`, () => {
      expect(
        renderEmittedStdout(id),
        'THE CLI NO LONGER PRODUCES WHAT THIS REFUSAL FIXTURE COMMITTED. The fixture was minted ' +
          'from the CLI itself (`sherlo test --dry-run --emit-expectation <scenario>`) and ' +
          'reviewed into git by a person; a divergence means the refusal a real user reads has ' +
          'changed - its wording, its colour, its blank lines or its box. That is a product ' +
          'change to argue for, not a fixture to re-record: if the new text is intended, re-mint ' +
          'this fixture in the same PR and say so.'
      ).toBe(committedFixture(fixture));
    });
  }

  it.runIf(TESTER_AVAILABLE)('renders the same bytes twice', () => {
    // Determinism, not truth - a producer agrees with itself by construction.
    // What this catches is a clock, a counter or an environment read leaking onto
    // the refusal path, which would make the fixtures unmintable rather than wrong.
    for (const id of PREFLIGHT_REFUSAL_IDS) {
      expect(renderEmittedStdout(id)).toBe(renderEmittedStdout(id));
    }
  });

  it.runIf(TESTER_AVAILABLE)(
    'CONTROL: a corrupted render is REJECTED (the comparison still rejects what it should)',
    () => {
      const { id, fixture } = everyBoundPair()[0];
      // One byte. Without this case a comparison that had degenerated into
      // `expect(x).toBe(x)` would look exactly as green as a real proof.
      expect(`${renderEmittedStdout(id)} `).not.toBe(committedFixture(fixture));
    }
  );

  it.runIf(TESTER_AVAILABLE)(
    'the enforced fixtures KEEP colour, so the comparison above is NOT blind to chalk boundaries',
    () => {
      // The load-bearing property of this family, asserted rather than assumed.
      // These fixtures capture through `maskPushOutput` (colour-preserving); if
      // one were ever re-minted through a stripping masker, every case above
      // would keep passing while going blind to every colour and style-boundary
      // change - and nothing else would say so.
      // eslint-disable-next-line no-control-regex
      const ansi = /\u001b\[[0-9;]*m/g;
      const colourless = everyBoundPair()
        .filter(({ fixture }) => (committedFixture(fixture).match(ansi) ?? []).length === 0)
        .map(({ fixture }) => fixture);
      expect(
        colourless,
        'an enforced refusal fixture carries no ANSI - this family is supposed to preserve it, ' +
          'and a stripped baseline would make the byte ratchet blind to the chalk class'
      ).toEqual([]);
    }
  );

  it.runIf(TESTER_AVAILABLE)(
    'the boxed refusal pads INSIDE its styled spans, so whitespace changes there are caught',
    () => {
      // The sharpest instance of the property above, pinned by name. The
      // "Preview Simulator Build" panel aligns its rows with spaces that sit
      // between a style-open and its close - the exact shape a stripping masker
      // renders invisible.
      const boxed = committedFixture(PREFLIGHT_REFUSALS['binary-path-missing'].fixtures[0]);
      expect(boxed).toContain('\u001b[34m\u001b[2m│\u001b[22m\u001b[39m ');
      expect(boxed).toContain('\u001b[1mpreview simulator build\u001b[22m');
    }
  );
});
