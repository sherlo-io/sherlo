/**
 * THE VERDICT CLOSER'S LINES - every literal `--wait` prints while it polls, and
 * every literal it prints when the build reaches a terminal state.
 *
 * Pure, like the rest of `src/render/`: state in, bytes out. The wait loop
 * (helpers/waitForBuildResult.ts) decides WHICH of these happen and in what
 * order; this decides what each one looks like.
 *
 * WHY THE BLANK LINES ARE NOT IN HERE. Eight of the blocks below sit between the
 * same two bare `console.log()` calls - the closer is always framed by one blank
 * line above and one below. Baking that frame into eight segments would be eight
 * copies of one print call, and a ninth closer added later would be free to
 * forget it. So the frame is its own segment (`blank-line`), emitted around a
 * closer by the loop, exactly as the shipped code's two bare `console.log()`
 * calls did before this layer existed.
 *
 * WHAT IS GATED IN HERE IS MARKED, LINE BY LINE. Three of these builders render
 * the sparse-build verdict, which the shipped wait loop emits ONLY for a build
 * the server marked `showsOnlyBranchChanges` - a project that opted into sparse
 * builds. They carry a `GATED` banner and are reachable only from
 * {@link decideSparseBuildVerdict}. A project that has not opted in never
 * reaches them, and its output is byte-identical to what it has always been.
 */
import chalk from 'chalk';

/* ========================================================================== */
/* THE PRESENT: bytes a user sees today, extracted verbatim                   */
/* ========================================================================== */

/** `⏳ Waiting for build results (timeout: 45min)...` - printed once, before the first poll. */
export function renderWaitHeader(timeoutMinutes: number): string {
  return chalk.dim(`⏳ Waiting for build results (timeout: ${timeoutMinutes}min)...`);
}

/**
 * The per-status progress line, reprinted only when the status CHANGES.
 *
 * An unmapped status falls through to the raw wire value rather than to a blank
 * line: a status this table has not learned yet is information, not nothing.
 */
const RUN_STATUS_LABEL: Record<string, string> = {
  queued: '🟡 Queued',
  waiting: '🟡 Waiting',
  inProgress: '🔵 Running',
  finished: '🟢 Finished',
  error: '🔴 Error',
  canceled: '⚪ Canceled',
};

export function renderWaitProgress(runStatus: string): string {
  return chalk.dim(`   ${RUN_STATUS_LABEL[runStatus] ?? runStatus}`);
}

/** `   still running... (5m elapsed)` - the heartbeat that keeps CI from seeing silence. */
export function renderWaitHeartbeat(statusLabel: string, elapsedMinutes: number): string {
  return chalk.dim(`   still ${statusLabel}... (${elapsedMinutes}m elapsed)`);
}

/** `   Network error, retrying... (<message>)` - a transient blip, not a verdict. */
export function renderWaitNetworkRetry(message: string): string {
  return chalk.dim(`   Network error, retrying... (${message})`);
}

/** `   Build not found, retrying...` - the build record has not appeared yet. */
export function renderWaitBuildNotFound(): string {
  return chalk.dim('   Build not found, retrying...');
}

/** `🔒 <message>` - a credential refused mid-poll. Not retryable, so it closes the run. */
export function renderWaitAuthFailed(message: string): string {
  return chalk.red(`🔒 ${message}`);
}

/** The two lines of the deadline closer. */
export function renderWaitTimedOut(timeoutMinutes: number): string[] {
  return [
    chalk.yellow(`⏰ Timeout reached after ${timeoutMinutes} minutes.`),
    chalk.yellow('   The build may still be running.'),
  ];
}

/** The Ctrl-C closer. The run keeps going in Sherlo; only the waiting stops. */
export function renderWaitInterrupted(): string {
  return chalk.dim('Stopped waiting. The run is still going in Sherlo.');
}

/** Today's generic green closer: every story either matched or was already approved. */
export function renderVerdictPassed(): string {
  return chalk.green('✅ All stories passed - no visual changes require review.');
}

/**
 * The compact closer for a build the SERVER closed without a device run: its own
 * verbatim prose reason inline, then the fixed dim line. No URL - the build has
 * nothing to review.
 *
 * The reason is the server's sentence, never one composed here, which is why it
 * arrives as a parameter rather than as a branch.
 */
export function renderVerdictServerBypassed(reason: string): string[] {
  return [
    chalk.green(`✅ Nothing needed capturing - ${reason}`),
    chalk.dim('   closed by the server - no device run was needed'),
  ];
}

/**
 * The block closer: something is waiting for a human. The two count lines are
 * printed only for a non-zero count, which is why this returns a LIST whose
 * length is itself a function of the state.
 */
export function renderVerdictReviewRequired(unreviewed: number, reported: number): string[] {
  const lines = [chalk.yellow('⚠️  Build finished with changes requiring review.')];
  if (unreviewed > 0) lines.push(chalk.yellow(`   ${unreviewed} story/stories unreviewed.`));
  if (reported > 0) lines.push(chalk.yellow(`   ${reported} story/stories reported.`));
  return lines;
}

/** The infrastructure closer. `runError` is server-shaped, so it is stringified, not phrased. */
export function renderVerdictRunErrored(runStatus: string, runError: unknown): string[] {
  const lines = [chalk.red(`❌ Build ended in "${runStatus}" state.`)];
  if (runError) lines.push(chalk.red(`   Error: ${JSON.stringify(runError)}`));
  return lines;
}

/* ========================================================================== */
/* GATED: the sparse-build verdict, for an opted-in project's branch build.    */
/* ========================================================================== */

/**
 * GATED on `showsOnlyBranchChanges` - an ungated build never reaches this.
 *
 * The verdict a BRANCH BUILD earns when it recorded snapshots and none of them
 * differed. Ungated, such a build falls into {@link renderVerdictPassed} while
 * the GitHub check independently re-derives `unreviewed` from the same all-zero
 * tally and posts `action_required` - so the CLI says pass and the check says
 * block, over one build.
 *
 * THE WORDING IS THE CHECK'S OWN, DELIBERATELY. `No visual changes` and `All
 * snapshots match their baselines` are `CHECK_COPY.noChanges.title` and
 * `.summary` verbatim (sherlo-tester e2e/helpers/branching/check-copy.ts, pinned
 * to the engine's `describeCheckState` by branching-check-copy.test.ts). Reusing
 * the existing state's existing copy is the operator's ruling: the two surfaces
 * are answering the same question about the same build, so they say the same
 * words rather than two phrasings of one verdict.
 */
export function renderVerdictNoChanges(): string {
  return chalk.green('✅ No visual changes - all snapshots match their baselines.');
}

/**
 * GATED on `showsOnlyBranchChanges` - an ungated build never reaches this.
 *
 * The accounting line under a sparse branch build's verdict: how much of the
 * suite this build actually photographed, and how much it carried over from the
 * build it branched from. It is the CLI's half of "a branch build surfaces only
 * the stories that branch caused to differ" - the numbers come straight off the
 * wire (`diffScopeInfo.capturedSnapshotCount` / `inheritedSnapshotCount`).
 */
export function renderVerdictCaptureAccounting(captured: number, inherited: number): string {
  return chalk.dim(`   ${captured} captured on this branch, ${inherited} inherited unchanged`);
}

/**
 * GATED on `showsOnlyBranchChanges` - an ungated build never reaches this.
 *
 * The build recorded NOTHING - it captured nothing and inherited nothing - so
 * there is no evidence either way. The SERVER already calls such a build
 * `unreviewed` rather than green (the SHERLO-2013 fallthrough); the capture
 * count decides only that it gets THESE words instead of a literal "0
 * story/stories unreviewed", which would be accurate and tell the reader
 * nothing. The verdict is not green either way.
 */
export function renderVerdictNothingRecorded(): string[] {
  return [
    chalk.yellow('⚠️  Build finished without recording any snapshots.'),
    chalk.yellow('   Nothing was captured and nothing was inherited, so this build is not'),
    chalk.yellow('   evidence that nothing changed. Check the run in Sherlo.'),
  ];
}
