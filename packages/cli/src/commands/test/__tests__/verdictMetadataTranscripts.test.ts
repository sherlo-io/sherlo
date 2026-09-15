/**
 * THE VISIBLE-SHAPE GATE for `--metadata` on the `--wait` roads.
 *
 * The `sherlo view --wait --metadata` half of this claim is now byte-ratcheted for real, by
 * `packages/cli/poses/view/verdict-metadata-after-view-wait.pose.json` under
 * `commands/pose/__tests__/catalogue.test.ts`. What is left to pin here is the half the pose
 * catalogue does not cover yet: `sherlo test --wait --metadata`, the road that OPENED the build
 * and so is the only one that can report which branch and commit it opened it from. Both halves
 * are run through the SHIPPED wait loop (`waitForBuildResult`) over a scripted poll answer -
 * every branch, dedupe and literal it reaches is the live one - so what is pinned is evidence
 * about the CLI, not about this file.
 *
 * It compares ANSI-STRIPPED text; the escapes are pinned per segment in
 * render/__tests__/renderLayerLiterals.test.ts.
 */
import { PROJECT_API_TOKEN_LENGTH } from '@sherlo/shared';
import chalk from 'chalk';
import { describe, expect, it } from 'vitest';
import stripAnsi from '../../../helpers/stripAnsi';
import waitForBuildResult, { type BuildStatus } from '../../../helpers/waitForBuildResult';
import { captureTranscript } from '../../../helpers/transcriptSink';
import type { BuildDetailsGitFacts } from '../../../render/buildView';

chalk.level = 1;

/**
 * A token of the real fixed-width layout `getTokenParts` slices. Nothing here
 * renders it, but the shipped loop parses it before polling, so a malformed one
 * would exercise a refusal instead of a wait.
 */
const SCRIPTED_TOKEN = `${'s'.repeat(PROJECT_API_TOKEN_LENGTH)}scenteam1`;

/**
 * The git identity a `sherlo test --wait --metadata` run reports - the value THAT RUN composed
 * and sent at openBuild, never something read back off the build: `getBuildStatus` returns no
 * git info at all.
 */
const OPENED_WITH_GIT: BuildDetailsGitFacts = {
  branchName: 'feature/login-copy',
  commitHash: '4f3a9c1e77b0d2a6f5c8419e3b7d0a1c2e6f8b04',
  isDirty: false,
  defaultBranch: 'main',
};

/** Run the SHIPPED wait loop over one scripted poll answer and return its ANSI-stripped stdout. */
async function runWaitLoop(
  build: BuildStatus,
  metadata?: { git?: BuildDetailsGitFacts }
): Promise<string> {
  const captured = await captureTranscript(async () => {
    await waitForBuildResult({
      token: SCRIPTED_TOKEN,
      buildIndex: 1,
      projectIndex: 1,
      teamId: 'scenteam',
      waitTimeoutMinutes: 45,
      metadata,
      pollBuildStatus: async () => build,
      now: () => 0,
    });
  });

  return stripAnsi(captured.stdout);
}

describe('`--metadata` on the wait roads', () => {
  /** Forty-four stories total, the same suite size the sparse-verdict family scripts. */
  const openedBuild: BuildStatus = {
    runStatus: 'finished',
    viewStatusesCount: { approved: 5, noChanges: 39, reported: 0, unreviewed: 0 },
    diffScopeInfo: { capturedSnapshotCount: 3, inheritedSnapshotCount: 41 },
  };

  it('the test road prints the block after the closer, carrying the git it opened the build with', async () => {
    expect(await runWaitLoop(openedBuild, { git: OPENED_WITH_GIT })).toBe(
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
    // `sherlo view` did not open this build, so it hands over no git - `getBuildStatus` does not
    // carry what a build was opened with either way.
    const build: BuildStatus = {
      runStatus: 'finished',
      viewStatusesCount: { approved: 0, noChanges: 41, reported: 0, unreviewed: 3 },
      diffScopeInfo: { capturedSnapshotCount: 3, inheritedSnapshotCount: 41 },
    };

    expect(await runWaitLoop(build, {})).toBe(
      [
        '⏳ Waiting for build results (timeout: 45min)...',
        '   🟢 Finished',
        '',
        '⚠️  Build finished with changes requiring review.',
        '   3 story/stories unreviewed.',
        '',
        '── details ──',
        // No branch, no main line.
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
    expect(await runWaitLoop(openedBuild)).not.toContain('── details ──');
  });

  it('renders the same bytes twice', async () => {
    // Determinism, not truth - what it catches is a clock or an ambient read
    // leaking onto the path.
    expect(await runWaitLoop(openedBuild, { git: OPENED_WITH_GIT })).toBe(
      await runWaitLoop(openedBuild, { git: OPENED_WITH_GIT })
    );
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
