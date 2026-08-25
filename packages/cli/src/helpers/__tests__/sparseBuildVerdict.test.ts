/**
 * THE SPARSE-BUILD VERDICT, AND THE GATE THAT KEEPS IT AWAY FROM EVERYONE ELSE.
 *
 * Two obligations are discharged here, and they pull in opposite directions,
 * which is why they are in one file where a reader can see both at once:
 *
 *   1. AN OPTED-IN BUILD gets the sparse verdict, and the CLI's exit code is the
 *      server's own answer rather than a formula of its own.
 *   2. EVERY OTHER BUILD prints what it printed yesterday, to the byte. This is
 *      the constraint the whole change lives under: the redesign must be
 *      invisible to a project that has not opted in.
 *
 * HOW (2) IS PROVEN, since "byte-identical to yesterday" is not something a test
 * can assert against a past it cannot run. Three instruments together:
 *
 *   - THE UNGATED BLOCK IS TEXTUALLY UNCHANGED. `evaluateTerminalState`'s
 *     finished arm was not edited; a single early return was inserted above it.
 *     That is a diff a reviewer reads in one glance.
 *   - THE EXISTING SUITE STILL PASSES UNCHANGED. waitForBuildResult.test.ts and
 *     its committed snapshot cover the ungated closers, the bypassed closer and
 *     every exit code, and neither was touched.
 *   - THE INDIFFERENCE TESTS BELOW. The two new wire fields are put on the build
 *     in every combination that is NOT opt-in - absent, `false`, and (the sharp
 *     one) a server `status` that WOULD flip the verdict if it were read - and
 *     the bytes are asserted equal to the same build with no new fields at all.
 *     That last case is the one that would catch a gate accidentally written as
 *     a truthiness test or read from the wrong field.
 *
 * Colour is off here. These assertions are about WHICH lines are printed and in
 * what order; the exact escapes each line is made of are pinned, per segment,
 * in render/__tests__/renderLayerLiterals.test.ts.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { captureTranscript } from '../transcriptSink';
import waitForBuildResult from '../waitForBuildResult';
import type { BuildStatus } from '../waitForBuildResult';
import { EXIT_BLOCK, EXIT_GREEN } from '../exitCodes';
import { decideSparseBuildVerdict, routesThroughSparseVerdict } from '../sparseBuildVerdict';
import { VERDICT_TRANSCRIPTS } from '../../commands/test/verdict.transcripts';
import { renderVerdictScenarioTranscript } from '../../commands/test/renderVerdictTranscript';

beforeAll(() => {
  chalk.level = 0;
});

/** A token of the real fixed-width layout `getTokenParts` slices. Nothing renders it. */
const TOKEN = `${'s'.repeat(32)}scenteam1`;

/**
 * Run the SHIPPED wait loop over one scripted poll answer and return both halves
 * of what it produced. The poll is the only thing substituted - every branch,
 * dedupe and literal the loop reaches is the live one.
 */
async function runWaitLoop(build: BuildStatus): Promise<{ exitCode: number; stdout: string }> {
  let exitCode = -1;

  const captured = await captureTranscript(async () => {
    exitCode = await waitForBuildResult({
      token: TOKEN,
      buildIndex: 1,
      projectIndex: 1,
      teamId: 'scenteam',
      waitTimeoutMinutes: 45,
      pollBuildStatus: async () => build,
      now: () => 0,
    });
  });

  return { exitCode, stdout: captured.stdout };
}

/** The two lines every run of the above starts with, before any closer. */
const WAIT_PREAMBLE = '⏳ Waiting for build results (timeout: 45min)...\n   🟢 Finished\n';

/* ========================================================================== */
/* (2) THE UNGATED PATH IS INDIFFERENT TO THE NEW FIELDS                      */
/* ========================================================================== */

describe('a build the server did not mark prints exactly what it always printed', () => {
  /**
   * The all-zero green - the very shape the redesign exists to change. Ungated it
   * must still take today's branch and say today's words, because the project
   * behind it never asked for anything different.
   */
  const allZeroGreen: BuildStatus = {
    runStatus: 'finished',
    viewStatusesCount: { approved: 0, noChanges: 0, reported: 0, unreviewed: 0 },
    diffScopeInfo: { capturedSnapshotCount: 0, inheritedSnapshotCount: 0 },
  };

  it('exits 0 and prints the generic green closer when the gate field is absent', async () => {
    const { exitCode, stdout } = await runWaitLoop(allZeroGreen);

    expect(exitCode).toBe(EXIT_GREEN);
    expect(stdout).toBe(
      `${WAIT_PREAMBLE}\n✅ All stories passed - no visual changes require review.\n\n`
    );
  });

  it('is unchanged when the server sends the gate explicitly false', async () => {
    const withoutGate = await runWaitLoop(allZeroGreen);
    const gateOff = await runWaitLoop({ ...allZeroGreen, showsOnlyBranchChanges: false });

    expect(gateOff.stdout).toBe(withoutGate.stdout);
    expect(gateOff.exitCode).toBe(withoutGate.exitCode);
  });

  /**
   * THE SHARP ONE. This build carries a server `status` of `unreviewed` - the
   * answer that, on the gated path, turns this exact build from a green into a
   * block. With the gate off it must be ignored completely. A gate written as
   * `if (build.showsOnlyBranchChanges)` over a truthy-ish value, or one that read
   * the status alone, would fail here and nowhere else.
   */
  it('ignores a server status that WOULD flip the verdict, when the gate is off', async () => {
    const withoutGate = await runWaitLoop(allZeroGreen);
    const statusOnly = await runWaitLoop({ ...allZeroGreen, status: 'unreviewed' });

    expect(statusOnly.exitCode).toBe(EXIT_GREEN);
    expect(statusOnly.stdout).toBe(withoutGate.stdout);
  });

  it("an opted-in build whose API sent no status degrades to today's path, not to a guess", async () => {
    const withoutGate = await runWaitLoop(allZeroGreen);
    const halfAnswer = await runWaitLoop({ ...allZeroGreen, showsOnlyBranchChanges: true });

    expect(routesThroughSparseVerdict({ ...allZeroGreen, showsOnlyBranchChanges: true })).toBe(
      false
    );
    expect(halfAnswer.stdout).toBe(withoutGate.stdout);
    expect(halfAnswer.exitCode).toBe(withoutGate.exitCode);
  });

  it('the ungated block closer is untouched by the new fields either', async () => {
    const build: BuildStatus = {
      runStatus: 'finished',
      viewStatusesCount: { approved: 0, noChanges: 41, reported: 1, unreviewed: 2 },
    };

    const withoutGate = await runWaitLoop(build);
    const gateOff = await runWaitLoop({
      ...build,
      showsOnlyBranchChanges: false,
      status: 'noChanges',
    });

    expect(withoutGate.exitCode).toBe(EXIT_BLOCK);
    expect(withoutGate.stdout).toBe(
      `${WAIT_PREAMBLE}\n⚠️  Build finished with changes requiring review.\n` +
        '   2 story/stories unreviewed.\n   1 story/stories reported.\n\n'
    );
    expect(gateOff.stdout).toBe(withoutGate.stdout);
    expect(gateOff.exitCode).toBe(withoutGate.exitCode);
  });
});

/* ========================================================================== */
/* (1) THE GATED PATH MIRRORS THE SERVER'S VERDICT                            */
/* ========================================================================== */

/** An opted-in build: the gate the server set, plus the status it computed. */
function optedIn(build: BuildStatus, status: NonNullable<BuildStatus['status']>): BuildStatus {
  return { ...build, showsOnlyBranchChanges: true, status };
}

describe('an opted-in build takes its verdict from the server, not from the tally', () => {
  const sparseBuild: BuildStatus = {
    runStatus: 'finished',
    viewStatusesCount: { approved: 0, noChanges: 3, reported: 0, unreviewed: 0 },
    diffScopeInfo: { capturedSnapshotCount: 3, inheritedSnapshotCount: 41 },
  };

  it("exits 0 on a `noChanges` build and says so in the check's own words", async () => {
    const { exitCode, stdout } = await runWaitLoop(optedIn(sparseBuild, 'noChanges'));

    expect(exitCode).toBe(EXIT_GREEN);
    expect(stdout).toBe(
      `${WAIT_PREAMBLE}\n✅ No visual changes - all snapshots match their baselines.\n` +
        '   3 captured on this branch, 41 inherited unchanged\n\n'
    );
  });

  it('exits 0 on `approved` too - an already-reviewed build is green on both surfaces', async () => {
    const { exitCode } = await runWaitLoop(optedIn(sparseBuild, 'approved'));

    expect(exitCode).toBe(EXIT_GREEN);
  });

  /**
   * THE DRIFT, CLOSED. This is the build the two surfaces disagreed over: an
   * all-zero tally with nothing recorded behind it. The server calls it
   * `unreviewed` and the check posts action_required; the CLI now reads that same
   * word and blocks, instead of exiting 0 saying "All stories passed".
   */
  it('exits 1 on the all-zero build the check calls unreviewed - the drift the redesign closes', async () => {
    const recordedNothing = optedIn(
      {
        runStatus: 'finished',
        viewStatusesCount: { approved: 0, noChanges: 0, reported: 0, unreviewed: 0 },
        diffScopeInfo: { capturedSnapshotCount: 0, inheritedSnapshotCount: 0 },
      },
      'unreviewed'
    );

    const { exitCode, stdout } = await runWaitLoop(recordedNothing);

    expect(exitCode).toBe(EXIT_BLOCK);
    expect(stdout).toContain('Build finished without recording any snapshots.');
    expect(stdout).not.toContain('All stories passed');
    expect(stdout).not.toContain('0 story/stories unreviewed');
  });

  /**
   * The counterweight to the case above, and the ruling the guard must not
   * over-reach on: a build that captured NOTHING but inherited the whole suite
   * has recorded plenty. It is green today and stays green, and it keeps the
   * server's own prose rather than being flattened into the generic sparse line.
   */
  it('a server-bypassed build stays green and keeps its verbatim reason', async () => {
    const bypassed = optedIn(
      {
        runStatus: 'finished',
        viewStatusesCount: { approved: 0, noChanges: 44, reported: 0, unreviewed: 0 },
        diffScopeInfo: {
          capturedSnapshotCount: 0,
          inheritedSnapshotCount: 44,
          platforms: { android: { reason: 'no change on this branch reaches any story' } },
        },
      },
      'noChanges'
    );

    const { exitCode, stdout } = await runWaitLoop(bypassed);

    expect(exitCode).toBe(EXIT_GREEN);
    expect(stdout).toContain(
      '✅ Nothing needed capturing - no change on this branch reaches any story'
    );
    expect(stdout).not.toContain('No visual changes');
  });

  it('the counts race is still poll-again, never a verdict', () => {
    expect(
      decideSparseBuildVerdict({
        runStatus: 'finished',
        showsOnlyBranchChanges: true,
        status: 'noChanges',
      })
    ).toBeNull();
    expect(
      decideSparseBuildVerdict({
        runStatus: 'inProgress',
        showsOnlyBranchChanges: true,
        status: 'noChanges',
        viewStatusesCount: { approved: 0, noChanges: 1, reported: 0, unreviewed: 0 },
      })
    ).toBeNull();
  });

  /**
   * ABSENT ACCOUNTING IS UNKNOWN, NEVER ZERO - and this is the regression the
   * API lane asked for by name.
   *
   * `diffScopeInfo` is absent entirely on a gate-off or bailed-open build, so
   * "the server sent no numbers" and "the server said nothing was recorded" are
   * different facts that a careless edit collapses into one `?? 0`. Collapsing
   * them would put every accounting-less build under the nothing-recorded copy,
   * telling a user who has two stories genuinely waiting for review that their
   * build photographed nothing.
   *
   * The verdict is exit 1 either way, which is exactly why this needs a test:
   * the exit code cannot catch it, only the words can.
   */
  it('a not-green build with NO diffScopeInfo says review-required, not nothing-recorded', async () => {
    const { exitCode, stdout } = await runWaitLoop(
      optedIn(
        {
          runStatus: 'finished',
          viewStatusesCount: { approved: 0, noChanges: 42, reported: 0, unreviewed: 2 },
        },
        'unreviewed'
      )
    );

    expect(exitCode).toBe(EXIT_BLOCK);
    expect(stdout).toContain('⚠️  Build finished with changes requiring review.');
    expect(stdout).toContain('   2 story/stories unreviewed.');
    expect(stdout).not.toContain('without recording any snapshots');
  });

  /**
   * The accounting line is omitted rather than zero-filled when the server sent
   * no numbers to say it with - an older API must not be made to assert
   * "0 captured, 0 inherited" about a build it never described.
   */
  it('prints no accounting line when the server sent no diffScopeInfo', async () => {
    const { stdout } = await runWaitLoop(
      optedIn(
        {
          runStatus: 'finished',
          viewStatusesCount: { approved: 0, noChanges: 44, reported: 0, unreviewed: 0 },
        },
        'noChanges'
      )
    );

    expect(stdout).toContain('✅ No visual changes - all snapshots match their baselines.');
    expect(stdout).not.toContain('captured on this branch');
  });
});

/* ========================================================================== */
/* THE TRANSCRIPTS NOW RENDER FROM THE SHIPPED PATH                           */
/* ========================================================================== */

/**
 * The three sparse transcripts were authored and reviewed as a DRAWING, before
 * the behaviour existed - rendered by calling the decider directly. They are now
 * rendered by the shipped wait loop over a scripted poll answer, and these
 * assertions are the proof that the drawing and the behaviour agree: the bytes
 * below are the bytes that commit put in front of an operator.
 *
 * The literals are written out rather than compared to a fixture because this
 * family has no usable baseline (see commands/test/verdict.transcripts.ts). If
 * the wiring were reverted, `renderVerdictScenarioTranscript` would render the
 * ungated closers and every one of these would red.
 */
describe('the sparse transcripts render from the shipped wait loop', () => {
  const EXPECTED: Record<string, string> = {
    'verdict-branch-build-nothing-differed':
      `${WAIT_PREAMBLE}\n✅ No visual changes - all snapshots match their baselines.\n` +
      '   3 captured on this branch, 41 inherited unchanged\n\n',

    'verdict-branch-build-only-the-branch-stories':
      `${WAIT_PREAMBLE}\n⚠️  Build finished with changes requiring review.\n` +
      '   2 story/stories unreviewed.\n' +
      '   3 captured on this branch, 41 inherited unchanged\n\n',

    'verdict-branch-build-recorded-nothing':
      `${WAIT_PREAMBLE}\n⚠️  Build finished without recording any snapshots.\n` +
      '   Nothing was captured and nothing was inherited, so this build is not\n' +
      '   evidence that nothing changed. Check the run in Sherlo.\n\n',
  };

  it.each(Object.keys(EXPECTED))('%s', async (id) => {
    const captured = await renderVerdictScenarioTranscript(VERDICT_TRANSCRIPTS[id]);

    expect(captured.stdout).toBe(EXPECTED[id]);
    expect(captured.stderr).toBe('');
  });

  it('every sparse scenario declares the gate it needs, and turns it on', () => {
    for (const id of Object.keys(EXPECTED)) {
      const scenario = VERDICT_TRANSCRIPTS[id];

      expect(scenario.groundedBy.kind).toBe('gated-shipped');
      expect(scenario.build.showsOnlyBranchChanges).toBe(true);
      expect(routesThroughSparseVerdict(scenario.build)).toBe(true);
    }
  });

  /**
   * And the present-proving half of the family must NOT be gated - if one of
   * those ever acquired the flag it would stop describing the default
   * experience while still claiming to, which is the one confusion this family
   * is built to prevent.
   */
  it('the present-proving scenarios carry no gate', () => {
    for (const [id, scenario] of Object.entries(VERDICT_TRANSCRIPTS)) {
      if (id in EXPECTED) continue;

      expect(scenario.groundedBy.kind).toBe('awaiting-remint');
      expect(routesThroughSparseVerdict(scenario.build)).toBe(false);
    }
  });
});
