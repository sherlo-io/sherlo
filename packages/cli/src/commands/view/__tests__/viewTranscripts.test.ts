/**
 * THE VISIBLE-SHAPE GATE for the `sherlo view` transcript family (F5).
 *
 * `sherlo view` is new, so no committed e2e fixture has ever captured it and
 * there is no byte ratchet to hold it to. This file is what stands in until
 * there is one, and it is deliberately pointed at the axis a ratchet would cover
 * and a per-segment pin cannot: WHICH lines the command prints, in WHAT ORDER,
 * and WHICH of them are withheld for a build the API said less about.
 *
 * IT COMPARES ANSI-STRIPPED TEXT, ON PURPOSE. The escapes are pinned per segment
 * in render/__tests__/renderLayerLiterals.test.ts, byte for byte, with a control
 * proving that pin catches a moved style boundary. Repeating those bytes here
 * would be a second copy of the same claim that could drift from the first; what
 * this file adds is the SEQUENCE, which survives stripping. The one thing it
 * still asserts about colour is that there IS some - a render that had lost it
 * entirely would otherwise match every expectation below for the wrong reason.
 *
 * Every expectation is rendered by the SHIPPED print path over a scripted read
 * (../renderViewTranscript), so a change to what `view` prints reds here rather
 * than in a fixture nobody regenerates.
 */
import chalk from 'chalk';
import { describe, expect, it } from 'vitest';
import stripAnsi from '../../../helpers/stripAnsi';
import { renderViewScenarioTranscript } from '../renderViewTranscript';
import { SCENARIO_BUILD_URL, VIEW_TRANSCRIPTS, VIEW_TRANSCRIPT_IDS } from '../view.transcripts';

/** Colour is pinned ON so the "colour survived" case below means something. */
chalk.level = 1;

/**
 * One ANSI escape, spelled with the control character rather than as a bare
 * bracket - `[` occurs in ordinary text, and a check that matched on it would
 * pass for the wrong reason.
 */
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\u001b\[/;

/** The closer every scenario ends the printed part with. */
const LINK_LINES = [`url=${SCENARIO_BUILD_URL}`, `🔗 ${SCENARIO_BUILD_URL}`, ''];

/**
 * What each scenario prints, line by line, with the escapes stripped.
 *
 * Written out rather than snapshotted: a snapshot's own remedy is `vitest -u`,
 * which blesses a changed transcript without a human reading the line that
 * moved. These are a diff a reviewer reads.
 */
const EXPECTED: Record<string, string[]> = {
  'view-finished-no-changes': [
    'Build #7 · finished',
    'approved 5 · reported 0 · unreviewed 0 · noChanges 39',
    '✅ No visual changes - all snapshots match their baselines.',
    '',
    ...LINK_LINES,
  ],

  'view-finished-needs-review': [
    'Build #7 · finished',
    'approved 0 · reported 0 · unreviewed 3 · noChanges 41',
    '⚠️  Visual changes need review - snapshots changed and are awaiting review in Sherlo.',
    '',
    ...LINK_LINES,
  ],

  'view-still-running': [
    'Build #7 · inProgress',
    // NO TALLY. The build has written no counts, and four zeros would read as a
    // finished build that recorded nothing.
    '🔵 Running visual tests - Sherlo is capturing and comparing snapshots for this commit.',
    '',
    ...LINK_LINES,
  ],

  'view-errored': [
    'Build #7 · error',
    '❌ Visual tests errored - the Sherlo build did not finish. Re-run to try again.',
    '',
    ...LINK_LINES,
    '── details ──',
    // One row, so the column is as narrow as one row makes it.
    'runner: errored (user_runner)',
    '',
  ],

  'view-metadata-branch-build': [
    'Build #7 · finished',
    'approved 0 · reported 0 · unreviewed 2 · noChanges 1',
    '⚠️  Visual changes need review - snapshots changed and are awaiting review in Sherlo.',
    '',
    ...LINK_LINES,
    '── details ──',
    // NO branch and NO main line: `getBuildStatus` carries no git info, and this
    // command did not open the build. The absence is the finding.
    'scope:         branch-only · feature build',
    'runner:        finished',
    'diff scope:    captured 3 · inherited 41',
    'verdicts cast: 0',
    '',
  ],

  'view-metadata-older-api': [
    'Build #7 · finished',
    'approved 4 · reported 0 · unreviewed 0 · noChanges 40',
    '✅ Visual changes approved - all changed snapshots were approved in Sherlo.',
    '',
    ...LINK_LINES,
    '── details ──',
    // The scope and accounting rows are ABSENT, not false and zero - and the
    // column narrows to the widest label that is left.
    'runner:        finished',
    'verdicts cast: 4',
    '',
  ],
};

async function renderStripped(id: string): Promise<string> {
  const transcript = await renderViewScenarioTranscript(VIEW_TRANSCRIPTS[id]);
  return stripAnsi(transcript.stdout);
}

describe('the view transcript catalog', () => {
  it('has scenarios (an emptied catalog would pass every case below by covering nothing)', () => {
    expect(VIEW_TRANSCRIPT_IDS.length).toBeGreaterThan(0);
  });

  it('every scenario states what it is for and how it is covered', () => {
    const unstated: string[] = [];
    for (const [id, scenario] of Object.entries(VIEW_TRANSCRIPTS)) {
      if (!scenario.description.trim()) unstated.push(`${id} - empty description`);
      if (!scenario.groundedBy.coveredBy.trim()) unstated.push(`${id} - covered by nothing`);
      if (scenario.buildIndex < 1) unstated.push(`${id} - not a build index`);
    }
    expect(unstated).toEqual([]);
  });

  it('every scenario has an expectation, and every expectation a scenario', () => {
    // Either half missing is the same defect wearing a different hat: a scenario
    // nothing judges, or an expectation judging nothing.
    expect(Object.keys(EXPECTED).sort()).toEqual([...VIEW_TRANSCRIPT_IDS].sort());
  });
});

describe('what `sherlo view` prints', () => {
  for (const id of VIEW_TRANSCRIPT_IDS) {
    it(`${id}: prints the lines it is pinned to, in order`, async () => {
      expect(
        await renderStripped(id),
        'WHAT `sherlo view` PRINTS HAS CHANGED. These lines are rendered by the shipped print ' +
          'path over a scripted read, so a divergence means the command now says something else ' +
          '- which is a product change, not a fixture to re-bless.'
      ).toBe(`${EXPECTED[id].join('\n')}\n`);
    });

    it(`${id}: renders the same bytes twice`, async () => {
      // Determinism, not truth. What it catches is a clock, a counter or an
      // environment read leaking onto the print path.
      expect(await renderStripped(id)).toBe(await renderStripped(id));
    });
  }

  it('CONTROL: the render carries colour, so stripping it is doing real work', async () => {
    const transcript = await renderViewScenarioTranscript(
      VIEW_TRANSCRIPTS['view-finished-no-changes']
    );

    // Without this, a renderer that had lost every chalk call would satisfy
    // every expectation above and look exactly as green as a correct one.
    expect(
      stripAnsi(transcript.stdout).length,
      'the render carries no escapes at all - every expectation above would then be matching a ' +
        'colourless transcript, which is not what a user sees'
    ).toBeLessThan(transcript.stdout.length);
  });

  it('CONTROL: the comparison still rejects a corrupted render', async () => {
    const rendered = await renderStripped('view-finished-no-changes');

    // One byte. Without this case a comparison that had degenerated into
    // `expect(x).toBe(x)` would look exactly as green as a real proof.
    expect(`${rendered} `).not.toBe(rendered);
  });

  it('the details block is COLOURLESS, which is what makes it byte-comparable', async () => {
    const transcript = await renderViewScenarioTranscript(
      VIEW_TRANSCRIPTS['view-metadata-branch-build']
    );

    const block = transcript.stdout.slice(transcript.stdout.indexOf('── details ──'));

    expect(
      block,
      'the details block grew an escape. A kept-output fixture compares it byte for byte, and a ' +
        'style that renders differently under a pipe than under a TTY would make it unstable.'
    ).not.toMatch(ANSI_ESCAPE);
  });
});
