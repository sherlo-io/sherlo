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

  // `--metadata` prints ONLY the JSON contract - no header, no colour, no url
  // line. See helpers/buildDetails's buildViewMetadataJson and
  // render/buildView's renderViewMetadataJson.
  'view-errored': ['{', '  "runStatus": "error",', '  "buildIndex": 7', '}'],

  'view-metadata-branch-build': [
    '{',
    '  "runStatus": "finished",',
    '  "buildIndex": 7,',
    '  "commit": {',
    '    "sha": "4f3a9c1d2e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c",',
    '    "branch": "e2e/sherlo-3/dev"',
    '  },',
    '  "viewStatusesCount": {',
    '    "approved": 5,',
    '    "noChanges": 0,',
    '    "reported": 0,',
    '    "unreviewed": 1',
    '  },',
    '  "stories": [',
    '    {',
    '      "name": "Typography - Scales",',
    '      "status": "review-required",',
    '      "baseline": null,',
    '      "reason": "two-baselines",',
    '      "candidates": [',
    '        {',
    '          "buildIndex": 2',
    '        },',
    '        {',
    '          "buildIndex": 4',
    '        }',
    '      ]',
    '    },',
    '    {',
    '      "name": "Typography - Dense",',
    '      "status": "unchanged",',
    '      "baseline": {',
    '        "buildIndex": 1',
    '      }',
    '    },',
    '    {',
    '      "name": "Sanity/Hello - Basic",',
    '      "status": "unchanged",',
    '      "baseline": {',
    '        "buildIndex": 1',
    '      }',
    '    }',
    '  ]',
    '}',
  ],

  // ABSENT, not zero-filled: an older API sends no gitInfo/stories, so `commit`
  // and `stories` are missing keys, not `null` / `[]`.
  'view-metadata-older-api': [
    '{',
    '  "runStatus": "finished",',
    '  "buildIndex": 7,',
    '  "viewStatusesCount": {',
    '    "approved": 4,',
    '    "noChanges": 40,',
    '    "reported": 0,',
    '    "unreviewed": 0',
    '  }',
    '}',
  ],

  'view-finished-with-stories-table': [
    'Build #7 · finished',
    'approved 1 · reported 0 · unreviewed 1 · noChanges 1',
    '⚠️  Visual changes need review - snapshots changed and are awaiting review in Sherlo.',
    '',
    'STORY                 STATUS           BASELINE',
    'Typography - Scales   review-required  two baselines (#2, #4)',
    'Typography - Dense    unchanged        build #1',
    'Sanity/Hello - Basic  approved         build #1',
    '',
    ...LINK_LINES,
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

  it("`--metadata`'s JSON is COLOURLESS, which is what makes it parseable", async () => {
    const transcript = await renderViewScenarioTranscript(
      VIEW_TRANSCRIPTS['view-metadata-branch-build']
    );

    expect(
      transcript.stdout,
      'the JSON contract grew an escape. It is meant to be piped into `JSON.parse`, and a style ' +
        'that renders differently under a pipe than under a TTY - or that simply is not valid ' +
        'JSON any more - would break every consumer of `sherlo view --metadata`.'
    ).not.toMatch(ANSI_ESCAPE);
  });
});
