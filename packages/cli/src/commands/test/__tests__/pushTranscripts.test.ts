/**
 * THE RATCHET, for the PUSH transcript family (F1) - the CLI's largest, at 31
 * committed fixtures.
 *
 * Every scenario in the catalog must render BYTE-IDENTICALLY to the fixture
 * already committed in sherlo-tester - a fixture produced by a real device run
 * against the real backend and reviewed into git by a person. Nothing here
 * regenerates a fixture. The committed bytes ARE the evidence.
 *
 * THIS FAMILY IS ANSI-PRESERVING, AND THAT IS WHY IT IS WORTH HAVING.
 * `maskPushOutput` keeps colour, unlike `maskTestBundledCli`, which strips it.
 * So where the dry-run ratchet is structurally blind to a chalk-boundary change
 * - hoist a `\n` out of a `chalk.cyan(...)` and the stripped bytes are identical
 * - this one is not: chalk re-opens its style on every line, so the hoist moves
 * real escape bytes and this comparison sees them. Measured, not assumed:
 * performing exactly that hoist on `manifest-producing` reds 17 of the 31 here,
 * with the diff reading `""` against `ESC[36mESC[39m`.
 *
 * ==========================================================================
 * WHY NOTHING IS BYTE-IDENTICAL TODAY, AND WHY THAT IS NOT A LAYER FAILURE
 * ==========================================================================
 *
 * All 31 fixtures render EXACTLY, escape for escape, except for one line the
 * CLI now prints and they do not: the machine-readable `url=` line at the
 * closer. It was added by sherlo commit 3755b8a on 2026-08-23 - the GitHub
 * Action shed `$GITHUB_OUTPUT` and the CLI started publishing its answers as
 * plain `key=value` stdout lines instead - and every fixture in this family was
 * last minted on or before 2026-08-21. Not one was re-minted for it.
 *
 * So the state of this family is: the render layer reproduces 100% of the bytes
 * a real run produced, and the committed baselines are one PRODUCT line stale.
 * That is a re-mint debt, not a rendering defect, and it is recorded as
 * {@link STALE_URL_KEY_LINE} below rather than papered over - deleting the line
 * from the render to make the comparison green would mean deleting a line real
 * users see.
 *
 * THE DEBT IS SELF-CLEARING. Once the re-mint dispatch lands, a fixture that
 * carries the `url=` line makes its entry stale, and the case below says so and
 * fails - so the exemption cannot outlive the defect it describes. THIS FAMILY'S
 * DIRECTORIES MUST NOT JOIN `MINTED_FIXTURE_DIRS` UNTIL THEN: a swept directory
 * asserts a fixture is minted, and a fixture nothing can render byte-identically
 * is not.
 */
import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { PUSH_TRANSCRIPTS, PUSH_TRANSCRIPT_IDS } from '../push.transcripts';
import { renderPushScenarioTranscript } from '../renderPushTranscript';
import type { PushTranscriptScenario } from '../push.transcripts';

import {
  TESTER_AVAILABLE,
  committedFixture as readCommittedFixture,
  declareTesterCheckoutGate,
  fixtureExists,
  testerMasker,
} from './testerCheckout';

/**
 * Colour is pinned ON, once, before anything renders. Modules in this layer bake
 * chalk into constants at import time, so a level set afterwards would silently
 * not apply to them.
 */
chalk.level = 1;

/**
 * THE ONE LINE EVERY COMMITTED PUSH FIXTURE PREDATES.
 *
 * Added by sherlo 3755b8a (2026-08-23), five days after the newest fixture in
 * this family was minted. It is a real line a real user sees; the fixtures are
 * behind, not the renderer.
 *
 * The remedy is one `update_baselines` dispatch over this family's suites -
 * a `-snapshots` baseline is RECORDED and re-minting one is a dispatch, never a
 * local edit (sherlo-tester docs/writing-specs.md, "Bootstrapping Snapshots").
 */
const STALE_URL_KEY_LINE = /^url=/;

async function renderMasked(scenario: PushTranscriptScenario): Promise<string> {
  const { maskPushOutput } = await testerMasker();
  const transcript = await renderPushScenarioTranscript(scenario);
  const raw =
    scenario.capture === 'stdout+stderr'
      ? transcript.stdout + transcript.stderr
      : transcript.stdout;
  return maskPushOutput(raw);
}

function committedFixture(scenario: PushTranscriptScenario): string {
  return readCommittedFixture(scenario.fixture);
}

function withoutStaleLine(rendered: string): string {
  return rendered
    .split('\n')
    .filter((line) => !STALE_URL_KEY_LINE.test(line))
    .join('\n');
}

describe('the push transcript catalog', () => {
  declareTesterCheckoutGate();

  it('has scenarios (an emptied catalog would pass every case below by covering nothing)', () => {
    expect(PUSH_TRANSCRIPT_IDS.length).toBeGreaterThan(0);
  });

  it('every scenario declares its grounding, its ambient and the fixture it answers for', () => {
    const unstated: string[] = [];
    for (const [id, scenario] of Object.entries(PUSH_TRANSCRIPTS)) {
      if (!scenario.description.trim()) unstated.push(`${id} - empty description`);
      if (!scenario.fixture.endsWith('.txt')) unstated.push(`${id} - fixture is not a .txt path`);
      if (scenario.groundedBy.kind === 'derived' && !scenario.groundedBy.fromFixture) {
        unstated.push(`${id} - derived from nothing`);
      }
    }
    expect(unstated).toEqual([]);
  });

  it('no two scenarios answer for the same fixture', () => {
    // A duplicated fixture path would mean one committed baseline is proved
    // twice and another not at all, while the counts above still looked right.
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [id, scenario] of Object.entries(PUSH_TRANSCRIPTS)) {
      const previous = seen.get(scenario.fixture);
      if (previous) duplicates.push(`${scenario.fixture} - both ${previous} and ${id}`);
      else seen.set(scenario.fixture, id);
    }
    expect(duplicates).toEqual([]);
  });

  it('every scenario scripts a binary size for every platform the backend gave a slot to', () => {
    // A missing size is a refusal at render time; catching it here names every
    // offender at once instead of one per run.
    const incomplete: string[] = [];
    for (const [id, scenario] of Object.entries(PUSH_TRANSCRIPTS)) {
      for (const platform of ['android', 'ios'] as const) {
        const binary = scenario.state.binariesInfo[platform];
        if (binary?.url && scenario.state.binarySizesMb[platform] === undefined) {
          incomplete.push(`${id} - ${platform} uploads but has no scripted size`);
        }
      }
    }
    expect(incomplete).toEqual([]);
  });

  it.runIf(TESTER_AVAILABLE)('every scenario names a fixture that exists', () => {
    const missing = Object.entries(PUSH_TRANSCRIPTS)
      .filter(([, scenario]) => !fixtureExists(scenario.fixture))
      .map(([id, scenario]) => `${id} -> ${scenario.fixture}`);
    expect(missing, 'a scenario answers for a fixture that is not in the tree').toEqual([]);
  });

  for (const id of PUSH_TRANSCRIPT_IDS) {
    it.runIf(TESTER_AVAILABLE)(`${id}: renders every byte of its committed fixture`, async () => {
      const scenario = PUSH_TRANSCRIPTS[id];
      const rendered = await renderMasked(scenario);
      const committed = committedFixture(scenario);

      // The comparison drops ONLY the one line the fixture predates (see
      // STALE_URL_KEY_LINE). Everything else - every escape, every blank
      // line, every emoji, the per-character gradient wordmark - is compared
      // exactly as committed.
      expect(
        withoutStaleLine(rendered),
        'THE RENDER LAYER NO LONGER REPRODUCES WHAT THE CLI PRINTED. This fixture was captured ' +
          'from a real device run against the real backend; a divergence means either the ' +
          "extraction changed what a user sees, or this scenario's scripted state is wrong. " +
          'Neither is fixed by re-recording the fixture, and neither is the known `url=` ' +
          'staleness - that line is already excluded from this comparison.'
      ).toBe(committed);
    });

    it.runIf(TESTER_AVAILABLE)(`${id}: renders the same bytes twice`, async () => {
      // Determinism, not truth - a producer agrees with itself by construction.
      // What this catches is a clock, a counter or an environment read leaking
      // onto the render path. It has already caught one: `getTimeAgo` read
      // `new Date()`, so a reuse line drifted from "7 minutes ago" to "1 week
      // ago" as the calendar moved. The instant is a scripted input now.
      expect(await renderMasked(PUSH_TRANSCRIPTS[id])).toBe(
        await renderMasked(PUSH_TRANSCRIPTS[id])
      );
    });
  }

  it.runIf(TESTER_AVAILABLE)(
    'the `url=` staleness is exactly one line, in every fixture, and nothing else',
    async () => {
      // The exemption's own boundary. Without this, "drop every line matching
      // /^url=/" could quietly grow into a mask that hid a second divergence.
      const wrong: string[] = [];
      for (const id of PUSH_TRANSCRIPT_IDS) {
        const rendered = await renderMasked(PUSH_TRANSCRIPTS[id]);
        const dropped = rendered.split('\n').filter((line) => STALE_URL_KEY_LINE.test(line));
        if (dropped.length !== 1) wrong.push(`${id} - dropped ${dropped.length} lines, expected 1`);
      }
      expect(wrong).toEqual([]);
    }
  );

  it.runIf(TESTER_AVAILABLE)(
    'the `url=` debt is SELF-CLEARING: no committed fixture carries the line yet',
    async () => {
      // The moment the re-mint dispatch lands, the fixtures grow the line, this
      // case fails, and STALE_URL_KEY_LINE must be deleted along with the
      // filtering above - turning the comparison into a plain byte-identity and
      // unblocking the MINTED_FIXTURE_DIRS widening. An exemption that could
      // outlive its defect is an amnesty, not a debt.
      const reminted = Object.entries(PUSH_TRANSCRIPTS)
        .filter(([, scenario]) =>
          committedFixture(scenario)
            .split('\n')
            .some((line) => STALE_URL_KEY_LINE.test(line))
        )
        .map(([id]) => id);

      expect(
        reminted,
        'these fixtures have been re-minted and now carry the `url=` line, so the staleness ' +
          'exemption is stale itself. Delete STALE_URL_KEY_LINE and withoutStaleLine, compare ' +
          'the bytes directly, and widen MINTED_FIXTURE_DIRS in sherlo-tester for the ' +
          'directories that now pass.'
      ).toEqual([]);
    }
  );

  it.runIf(TESTER_AVAILABLE)(
    'CONTROL: a corrupted render is REJECTED (the comparison still rejects what it should)',
    async () => {
      const scenario = PUSH_TRANSCRIPTS[PUSH_TRANSCRIPT_IDS[0]];
      const rendered = withoutStaleLine(await renderMasked(scenario));
      // One byte. Without this case a comparison that had degenerated into
      // `expect(x).toBe(x)` would look exactly as green as a real proof.
      expect(`${rendered} `).not.toBe(committedFixture(scenario));
    }
  );

  it.runIf(TESTER_AVAILABLE)(
    'the mask KEEPS colour here, so the comparison above is NOT blind to chalk boundaries',
    async () => {
      // The load-bearing difference from the dry-run family, asserted rather
      // than assumed. If `maskPushOutput` ever started stripping ANSI, every
      // case above would keep passing while going blind to every colour and
      // style-boundary change - and nothing else would say so.
      const masked = await renderMasked(PUSH_TRANSCRIPTS[PUSH_TRANSCRIPT_IDS[0]]);
      // eslint-disable-next-line no-control-regex
      const ansi = /\u001b\[[0-9;]*m/g;
      expect(
        (masked.match(ansi) ?? []).length,
        'the masked push transcript carries no ANSI - this family is supposed to preserve it'
      ).toBeGreaterThan(100);
    }
  );
});
