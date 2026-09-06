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
      .filter(([, s]) => !fixtureExists(s.fixture))
      .map(([id, s]) => `${id} -> ${s.fixture}`);
    expect(missing, 'a scenario answers for a fixture that is not in the tree').toEqual([]);
  });

  for (const id of DRY_RUN_TRANSCRIPT_IDS) {
    it.runIf(TESTER_AVAILABLE)(
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
