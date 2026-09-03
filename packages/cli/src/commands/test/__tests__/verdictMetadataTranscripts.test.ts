/**
 * THE VISIBLE-SHAPE GATE for `--metadata` on the `--wait` roads.
 *
 * The verdict family's own three baselines are on AWAITING_REMINT (see
 * ../verdict.transcripts), so nothing byte-ratchets these scenarios either. What
 * this file pins is the part a re-mint would not cover on its own and a
 * per-segment pin cannot: that the `── details ──` block is appended AFTER the
 * closer and its framing blank line, that it is appended only for a build that
 * reached a terminal state, and that the two roads differ in exactly one way -
 * the road that opened the build reports its git identity and the road that
 * merely looked at one does not.
 *
 * It compares ANSI-STRIPPED text; the escapes are pinned per segment in
 * render/__tests__/renderLayerLiterals.test.ts. See the view family's gate
 * (commands/view/__tests__/viewTranscripts.test.ts) for why the two instruments
 * are split that way.
 */
import { PROJECT_API_TOKEN_LENGTH } from '@sherlo/shared';
import chalk from 'chalk';
import { describe, expect, it } from 'vitest';
import stripAnsi from '../../../helpers/stripAnsi';
import waitForBuildResult, { type BuildStatus } from '../../../helpers/waitForBuildResult';
import { captureTranscript } from '../../../helpers/transcriptSink';
import { renderVerdictScenarioTranscript } from '../renderVerdictTranscript';
import { VERDICT_TRANSCRIPTS } from '../verdict.transcripts';

chalk.level = 1;

/**
 * A token of the real fixed-width layout `getTokenParts` slices. Nothing here
 * renders it, but the shipped loop parses it before polling, so a malformed one
 * would exercise a refusal instead of a wait.
 */
const SCRIPTED_TOKEN = `${'s'.repeat(PROJECT_API_TOKEN_LENGTH)}scenteam1`;

async function renderStripped(id: string): Promise<string> {
  const transcript = await renderVerdictScenarioTranscript(VERDICT_TRANSCRIPTS[id]);
  return stripAnsi(transcript.stdout);
}

describe('`--metadata` on the wait roads', () => {
  it('the test road prints the block after the closer, carrying the git it opened the build with', async () => {
    expect(await renderStripped('verdict-metadata-after-test-wait')).toBe(
      [
        '⏳ Waiting for build results (timeout: 45min)...',
        '   🟢 Finished',
        '',
        '✅ All stories passed - no visual changes require review.',
        '',
        '── details ──',
        'branch:        feature/login-copy @ 4f3a9c1 (clean tree)',
        'main line:     main',
        'runner:        finished',
        'diff scope:    captured 3 · inherited 41',
        'verdicts cast: 5',
        '',
        '',
      ].join('\n')
    );
  });

  it('the view road prints the SAME block minus every fact the wire cannot serve', async () => {
    expect(await renderStripped('verdict-metadata-after-view-wait')).toBe(
      [
        '⏳ Waiting for build results (timeout: 45min)...',
        '   🟢 Finished',
        '',
        '⚠️  Build finished with changes requiring review.',
        '   3 story/stories unreviewed.',
        '',
        '── details ──',
        // No branch, no main line. `sherlo view` did not open this build and
        // `getBuildStatus` does not carry what it was opened with.
        'runner:        finished',
        'diff scope:    captured 3 · inherited 41',
        'verdicts cast: 0',
        '',
        '',
      ].join('\n')
    );
  });

  it('a scenario that did not ask for the block does not get one', async () => {
    // The flag is the ONLY thing that turns it on: presence of `metadata`.
    expect(await renderStripped('verdict-today-all-passed')).not.toContain('── details ──');
  });

  it('renders the same bytes twice', async () => {
    // Determinism, not truth - what it catches is a clock or an ambient read
    // leaking onto the path.
    const id = 'verdict-metadata-after-test-wait';
    expect(await renderStripped(id)).toBe(await renderStripped(id));
  });
});

describe('the block is bound to a build that actually finished', () => {
  it('a deadline prints the timeout closer and NO details block', async () => {
    // A timed-out wait has no terminal build to describe, and a details block
    // about a build nobody got an answer for would be worse than none.
    const transcript = await captureTranscript(async () => {
      let clock = 0;
      await waitForBuildResult({
        token: SCRIPTED_TOKEN,
        buildIndex: 1,
        projectIndex: 1,
        teamId: 'scenteam',
        waitTimeoutMinutes: 45,
        metadata: {},
        // Past the deadline on the very first check, so the loop closes on the
        // timeout without ever reaching a terminal state.
        now: () => {
          clock += 46 * 60 * 1000;
          return clock;
        },
        pollBuildStatus: async () => ({ runStatus: 'inProgress' }),
      });
    });

    const stdout = stripAnsi(transcript.stdout);

    expect(stdout).toContain('⏰ Timeout reached after 45 minutes.');
    expect(stdout).not.toContain('── details ──');
  });

  it('a build still running gets no block, and gets exactly one when it finishes', async () => {
    const scripted: BuildStatus[] = [
      { runStatus: 'inProgress' },
      {
        runStatus: 'finished',
        viewStatusesCount: { approved: 0, noChanges: 44, reported: 0, unreviewed: 0 },
      },
    ];

    // The loop sleeps its real 15s between polls, bounded by whatever time is
    // left on the deadline - so the clock is walked to just short of it and the
    // sleep collapses to milliseconds. Nothing else about the loop is changed.
    const timeoutMs = 45 * 60 * 1000;
    let clock = 0;
    let answered = 0;

    const transcript = await captureTranscript(async () => {
      await waitForBuildResult({
        token: SCRIPTED_TOKEN,
        buildIndex: 1,
        projectIndex: 1,
        teamId: 'scenteam',
        waitTimeoutMinutes: 45,
        metadata: {},
        now: () => clock,
        pollBuildStatus: async () => {
          clock = timeoutMs - 5;
          return scripted[Math.min(answered++, scripted.length - 1)];
        },
      });
    });

    const stdout = stripAnsi(transcript.stdout);

    expect(answered, 'the loop polled twice - once not terminal, once terminal').toBe(2);
    expect(stdout.match(/── details ──/g) ?? []).toHaveLength(1);
    expect(stdout).toContain('runner:        finished');
  });
});
