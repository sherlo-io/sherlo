/**
 * THE RATCHET, for the `--dry-run` transcript family.
 *
 * Every scenario in the catalog must render BYTE-IDENTICALLY to the fixture
 * already committed in sherlo-tester - a fixture produced by a real device run
 * against the real backend and reviewed into git by a person. Nothing here
 * regenerates a fixture. That is the whole point: the committed bytes are the
 * evidence, and the render layer has to reproduce them or the extraction changed
 * what a user sees.
 *
 * What byte-identity proves, precisely: the extracted layer reproduces the bytes
 * the world produced on the day that fixture was recorded. That is a real claim
 * about the renderer AND the scripted state - and it has an expiry date, because
 * the world moves. Renewing the date is the reconciliation lane's job, not this
 * file's.
 *
 * WHERE THE FIXTURES ARE. In the sibling sherlo-tester checkout, and so is the
 * masker the capture applies - which this file uses rather than copying, because
 * a producer-local masker is a second implementation that can drift from the one
 * the capture runs. `testerCheckout.ts` owns locating that checkout and deciding
 * what an absent one means: a developer may skip the byte cases, CI may NOT (an
 * absent checkout REDS there). The SHAPE cases below never skip either way, so
 * this file is never a silent no-op.
 */
import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import {
  DRY_RUN_TRANSCRIPTS,
  DRY_RUN_TRANSCRIPT_IDS,
  FIXTURE_ROOTS,
  type TranscriptScenario,
} from '../dryRun.transcripts';
import { renderScenarioTranscript, transcriptForCapture } from '../renderTranscript';
import {
  TESTER_AVAILABLE,
  committedFixture,
  declareTesterCheckoutGate,
  fixtureExists,
  testBundledMasker,
} from './testerCheckout';

/**
 * Colour is pinned ON, once, before anything renders. `render/dryRunPlan` bakes
 * `chalk.yellow` into a MODULE-LEVEL constant at import time, so a level set
 * afterwards would silently not apply to it - which is exactly the trap the two
 * existing offline-render prototypes hit and worked around by hand.
 */
chalk.level = 1;

async function renderMasked(scenario: TranscriptScenario): Promise<string> {
  const { maskTestBundledCli } = await testBundledMasker();
  const transcript = await renderScenarioTranscript(scenario);
  return maskTestBundledCli(transcriptForCapture(scenario, transcript));
}

describe('the dry-run transcript catalog', () => {
  declareTesterCheckoutGate();

  it('has scenarios (an emptied catalog would pass every case below by covering nothing)', () => {
    expect(DRY_RUN_TRANSCRIPT_IDS.length).toBeGreaterThan(0);
  });

  it('every scenario declares its grounding, its ambient and the fixture it answers for', () => {
    // `groundedBy` and `ambient` are required by the TypeScript type, so this
    // case is not what enforces them - it is what catches a scenario that
    // satisfies the type with an empty string.
    const unstated: string[] = [];
    for (const [id, scenario] of Object.entries(DRY_RUN_TRANSCRIPTS)) {
      if (!scenario.description.trim()) unstated.push(`${id} - empty description`);
      if (!scenario.fixture.endsWith('.txt')) unstated.push(`${id} - fixture is not a .txt path`);
      if (scenario.groundedBy.kind === 'derived' && !scenario.groundedBy.fromFixture) {
        unstated.push(`${id} - derived from nothing`);
      }
    }
    expect(unstated).toEqual([]);
  });

  it("every scenario answers for a fixture under one of the catalog's declared roots", () => {
    // A fixture path is resolved by joining it onto the sherlo-tester checkout,
    // so a path under ANY tree in that repository resolves. What this case is
    // for is the other direction: a root nobody declared is how a typo, or a
    // tree that quietly moved, reaches a consumer as a missing file rather than
    // as a review finding.
    const declaredRoots = Object.values(FIXTURE_ROOTS);
    const strays = Object.entries(DRY_RUN_TRANSCRIPTS)
      .filter(
        ([, scenario]) => !declaredRoots.some((root) => scenario.fixture.startsWith(`${root}/`))
      )
      .map(([id, scenario]) => `${id} -> ${scenario.fixture}`);

    expect(
      strays,
      'a scenario names a fixture root this catalog does not declare - add it to FIXTURE_ROOTS, ' +
        'saying what lives there, or fix the path'
    ).toEqual([]);
  });

  it('the six LEGACY fixture paths are UNCHANGED - the legacy suites still consume them', () => {
    // Pinned as literals, not derived from FIXTURE_ROOTS: a case that composed
    // the expected paths the same way the catalog does would agree with any
    // move of the root, which is exactly the change it exists to catch. These
    // six are consumed by suites that are still green, so moving one is a red
    // capture night, not a refactor.
    //
    // It reads the six BY ID rather than comparing the whole catalog, because
    // those are two different claims: "these six have not moved" is a law, and
    // "there are exactly six" was never one - the catalog is meant to grow. A
    // missing id still reds here (it reads back as undefined), so a deletion is
    // caught as loudly as a move.
    const legacyFixtures = {
      'dry-run-single-platform-nothing-to-capture':
        'e2e/suites/snapshots/test-bundled/06-single-platform.spec.ts-snapshots/u4-single-platform-cli-Test-Bundled-darwin.txt',
      'dry-run-cold-start':
        'e2e/suites/snapshots/test-bundled/09-cold-start.spec.ts-snapshots/c3-cold-start-cli-Test-Bundled-darwin.txt',
      'dry-run-provenance-guard-skip':
        'e2e/suites/snapshots/test-bundled/10-provenance-guard-skip.spec.ts-snapshots/c4b-guard-skip-cli-Test-Bundled-darwin.txt',
      'dry-run-api-unreachable':
        'e2e/suites/snapshots/test-bundled-checks/02-failure-modes.spec.ts-snapshots/f4-api-unreachable-cli-Test-Bundled-Checks-darwin.txt',
      'dry-run-detached-head':
        'e2e/suites/snapshots/test-bundled-checks/02-failure-modes.spec.ts-snapshots/f6-detached-head-cli-Test-Bundled-Checks-darwin.txt',
      'dry-run-no-git':
        'e2e/suites/snapshots/test-bundled-checks/02-failure-modes.spec.ts-snapshots/f6-no-git-cli-Test-Bundled-Checks-darwin.txt',
    };

    const declared = Object.fromEntries(
      Object.keys(legacyFixtures).map((id) => [id, DRY_RUN_TRANSCRIPTS[id]?.fixture])
    );

    expect(declared).toEqual(legacyFixtures);
  });

  it('every declared root is a path RELATIVE TO THE CHECKOUT ROOT', () => {
    // The one claim about a root that holds whether or not the tree behind it
    // exists yet, and the one both consumers depend on: a root is joined onto a
    // repository root, so an absolute path or a `..` escape would resolve
    // somewhere neither the ratchet nor `expected-render` means. This runs with
    // no checkout, which is what lets a root be declared BEFORE the tree it
    // names is created - `e2e-beats/suites` is such a root today.
    const malformed = Object.entries(FIXTURE_ROOTS)
      .filter(
        ([, root]) => root.startsWith('/') || root.endsWith('/') || root.split('/').includes('..')
      )
      .map(([name, root]) => `${name} -> ${root}`);

    expect(
      malformed,
      'a fixture root must be relative to the sherlo-tester repo root, with no trailing slash'
    ).toEqual([]);
  });

  it.runIf(TESTER_AVAILABLE)(
    'every root a SCENARIO ANSWERS UNDER is a real tree in the checkout',
    () => {
      // Scoped to the roots in use, because that is the strongest form of this
      // claim that can be true: a root may be declared before its tree exists
      // (the beats suites are not in the checkout yet), and a case that demanded
      // otherwise would red for a tree nobody has authored rather than for a
      // mistake. The moment a scenario answers under a root, the root has to be
      // there - and the per-scenario `fixtureExists` case below then proves the
      // whole path, not just its head.
      const rootsInUse = new Set(
        Object.values(DRY_RUN_TRANSCRIPTS).map(
          (scenario) =>
            Object.values(FIXTURE_ROOTS).find((root) => scenario.fixture.startsWith(`${root}/`)) ??
            ''
        )
      );

      const unreachable = [...rootsInUse].filter((root) => !fixtureExists(root));

      expect(unreachable, 'a fixture root a scenario answers under is not in the checkout').toEqual(
        []
      );
    }
  );

  it('every scenario scripts a bundle for every platform it puts under test', () => {
    // A missing bundle is a refusal at render time; catching it here names every
    // offender at once instead of one per run.
    const incomplete: string[] = [];
    for (const [id, scenario] of Object.entries(DRY_RUN_TRANSCRIPTS)) {
      for (const platform of scenario.state.platformsToTest) {
        if (!scenario.state.bundles[platform]) incomplete.push(`${id} - no bundle for ${platform}`);
      }
    }
    expect(incomplete).toEqual([]);
  });

  it.runIf(TESTER_AVAILABLE)('every scenario names a fixture that exists', () => {
    const missing = Object.entries(DRY_RUN_TRANSCRIPTS)
      .filter(([, s]) => !s.fixtureNotMintedYet && !fixtureExists(s.fixture))
      .map(([id, s]) => `${id} -> ${s.fixture}`);
    expect(missing, 'a scenario answers for a fixture that is not in the tree').toEqual([]);
  });

  it.runIf(TESTER_AVAILABLE)('a NOT-MINTED-YET marker cannot outlive the mint', () => {
    // The whole risk of that marker is that it becomes a permanent opt-out of
    // the byte case. It cannot: the moment `yarn tester expected-render` writes
    // the bytes, this case reds until the marker comes off - which is what turns
    // the scenario back into a ratcheted one. A marker is a statement about the
    // tree, and this is what keeps it true.
    const stale = Object.entries(DRY_RUN_TRANSCRIPTS)
      .filter(([, s]) => s.fixtureNotMintedYet && fixtureExists(s.fixture))
      .map(([id, s]) => `${id} -> ${s.fixture}`);

    expect(
      stale,
      'this fixture HAS been minted, so the scenario is ratchetable now: drop ' +
        '`fixtureNotMintedYet` and let the byte case judge it'
    ).toEqual([]);
  });

  for (const id of DRY_RUN_TRANSCRIPT_IDS) {
    // A scenario whose fixture has never been minted has nothing to be identical
    // TO - it is the render that will create those bytes. Every other case in
    // this file still covers it, the determinism case below included, and the
    // staleness case above turns this one back on the moment the mint lands.
    it.runIf(TESTER_AVAILABLE && !DRY_RUN_TRANSCRIPTS[id].fixtureNotMintedYet)(
      `${id}: renders byte-identically to its committed fixture`,
      async () => {
        const scenario = DRY_RUN_TRANSCRIPTS[id];
        const rendered = await renderMasked(scenario);
        const committed = committedFixture(scenario.fixture);

        expect(
          rendered,
          'THE RENDER LAYER NO LONGER REPRODUCES WHAT THE CLI PRINTED. This fixture was captured ' +
            'from a real device run against the real backend; a divergence means either the ' +
            "extraction changed what a user sees, or this scenario's scripted state is wrong. " +
            'Neither is fixed by re-recording the fixture.'
        ).toBe(committed);
      }
    );

    it.runIf(TESTER_AVAILABLE)(`${id}: renders the same bytes twice`, async () => {
      const scenario = DRY_RUN_TRANSCRIPTS[id];
      // Determinism, not truth - a producer agrees with itself by construction.
      // What this catches is a clock, a counter or an environment read leaking
      // onto the render path.
      expect(await renderMasked(scenario)).toBe(await renderMasked(scenario));
    });
  }

  it.runIf(TESTER_AVAILABLE)(
    'CONTROL: a corrupted render is REJECTED (the comparison still rejects what it should)',
    async () => {
      const scenario = DRY_RUN_TRANSCRIPTS[DRY_RUN_TRANSCRIPT_IDS[0]];
      const rendered = await renderMasked(scenario);
      const committed = committedFixture(scenario.fixture);
      // One byte. Without this case a comparison that had degenerated into
      // `expect(x).toBe(x)` would look exactly as green as a real proof.
      expect(`${rendered} `).not.toBe(committed);
    }
  );

  it.runIf(TESTER_AVAILABLE)(
    'the shipped masker is LOAD-BEARING: the raw render carries ANSI the fixture does not',
    async () => {
      const scenario = DRY_RUN_TRANSCRIPTS[DRY_RUN_TRANSCRIPT_IDS[0]];
      const raw = transcriptForCapture(scenario, await renderScenarioTranscript(scenario));
      // The intro banner alone is emitted per character by gradient-string, so a
      // colourised render carries hundreds of escapes. A render that carried
      // none would be matching the fixture for the wrong reason - the mask would
      // be doing nothing, and colour drift would go unseen.
      expect((raw.match(/\u001b\[/g) ?? []).length).toBeGreaterThan(100);
    }
  );
});
