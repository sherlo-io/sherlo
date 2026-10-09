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
 * One screen of the build a wait is closing on - the two fields this closer
 * reads, and nothing else.
 *
 * Spelled here rather than reusing buildView's `ViewMetadataStory` because a
 * closer that declared a `baseline` it never looks at would invite the next
 * reader to wonder where it is printed. The wire rows satisfy this type as
 * they are.
 */
export type VerdictScreen = {
  name: string;
  /**
   * The per-screen status, as the plain string the wire sends (`changed`,
   * `rejected`, `not-captured`, ...). Not narrowed, for the reason the wire
   * shape gives (helpers/buildStatusRequest): a value this CLI has not learned
   * yet must still pass through.
   */
  status: string;
};

/**
 * The screens that are DONE - nobody has to open the build because of them.
 *
 * `approved` and `unchanged` are the obvious two. `not-captured` is the third:
 * Diff Scope left that screen out of this build and carried its accepted image
 * forward, so it is settled by inheritance rather than by a fresh comparison.
 * Everything NOT in here is named, including a status this table has not
 * learned - an unknown status is far likelier to be something new that wants a
 * person than something new that does not.
 */
const SETTLED_STATUSES = new Set(['approved', 'unchanged', 'not-captured']);

/**
 * The word the closer says a screen under, per wire status.
 *
 * The three words are the ones the build's own tally uses - `unreviewed`,
 * `reported` - plus `errored` for a capture that failed, so a reader who has
 * seen `2 story/stories unreviewed.` before reads the same vocabulary here. A
 * status with no entry is said under its own wire spelling rather than dropped.
 */
const SCREEN_LABEL: Record<string, string> = {
  new: 'unreviewed',
  changed: 'unreviewed',
  'review-required': 'unreviewed',
  rejected: 'reported',
  error: 'errored',
};

/**
 * How many screens the closer names before it stops naming and counts the rest.
 *
 * TEN, because this block is read at the END OF A CI LOG, where `--wait` is the
 * common path and `sherlo view` is the opt-in one. Ten names still fit the tail
 * a CI UI shows without expanding the log, and a developer looking at more than
 * ten screens that need them is going to open the build anyway - the eleventh
 * name would not change what they do next, while a hundred of them would bury
 * the verdict line that says what happened.
 */
const NAMED_SCREEN_LIMIT = 10;

/**
 * The block closer: something is waiting for a human, and this says WHO it is
 * waiting on.
 *
 * Given the build's screens it names the ones that need a person and counts the
 * ones that do not - the same facts `sherlo view` prints, so a developer who
 * waited does not have to run a second command to learn which screen it is.
 *
 * `screens` is absent when the wait never learned them (an older backend, or a
 * status read that came back without the rows), and a screen list that names
 * nobody says less than the tally does. Both fall back to `counts` - the two
 * lines this closer has always printed, byte for byte.
 */
export function renderVerdictReviewRequired(
  screens: VerdictScreen[] | undefined,
  counts: { unreviewed: number; reported: number }
): string[] {
  const headline = chalk.yellow('⚠️  Build finished with changes requiring review.');

  const allScreens = screens ?? [];
  const needAPerson = allScreens.filter((screen) => !SETTLED_STATUSES.has(screen.status));
  if (needAPerson.length === 0) return [headline, ...renderCountLines(counts)];

  const named = needAPerson.slice(0, NAMED_SCREEN_LIMIT);
  const unnamed = needAPerson.length - named.length;
  const settled = allScreens.length - needAPerson.length;

  return [
    headline,
    ...named.map((screen) =>
      chalk.yellow(`   ${SCREEN_LABEL[screen.status] ?? screen.status}: ${screen.name}`)
    ),
    ...(unnamed > 0 ? [chalk.yellow(`   ... and ${unnamed} more needing review.`)] : []),
    ...(settled > 0
      ? [chalk.dim(`   ${settled} more settled - approved, unchanged or inherited.`)]
      : []),
  ];
}

/**
 * The tally lines, printed only for a non-zero count - which is why this returns
 * a LIST whose length is itself a function of the state.
 */
function renderCountLines(counts: { unreviewed: number; reported: number }): string[] {
  const { unreviewed, reported } = counts;

  const lines: string[] = [];
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
