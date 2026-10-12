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
import {
  countStories,
  renderFailedTestStep,
  renderHelpBlock,
  renderTestStep,
  renderVerdictSection,
} from './testSteps';

/* ========================================================================== */
/* THE PRESENT: bytes a user sees today, extracted verbatim                   */
/* ========================================================================== */

/**
 * The test a line names: `Test 7` once its number is known, `the test` (lowercase, as a sentence's
 * subject or object) only while it is not - the wait loop does not pass the number yet (build work).
 */
function theTest(testIndex: number | undefined): string {
  return testIndex !== undefined ? `Test ${testIndex}` : 'the test';
}

/** The command that goes on waiting for a test, said at the end of every line that stops waiting. */
function keepWaiting(testIndex: number): string {
  return `To keep waiting: ${chalk.cyan(`npx sherlo view ${testIndex} --wait`)}`;
}

/**
 * `Waiting for Test 7 to finish (up to 45 min)...` - printed once, before the first poll: the
 * line init's grammar prints where a terminal would show a spinner (a spinner is build work).
 */
export function renderWaitHeader(timeoutMinutes: number, testIndex?: number): string {
  return chalk.dim(`Waiting for ${theTest(testIndex)} to finish (up to ${timeoutMinutes} min)...`);
}

/**
 * The per-status progress line, reprinted only when the status CHANGES.
 *
 * An unmapped status falls through to the raw wire value rather than to a blank
 * line: a status this table has not learned yet is information, not nothing.
 */
const RUN_STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  waiting: 'Waiting',
  inProgress: 'Running',
  finished: 'Finished',
  error: 'Error',
  canceled: 'Canceled',
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

/** `   Test not found yet, retrying...` - the test's record has not appeared yet. */
export function renderWaitBuildNotFound(): string {
  return chalk.dim('   Test not found yet, retrying...');
}

/** `✖ <message>` - a credential refused mid-poll. Not retryable, so it closes the run. */
export function renderWaitAuthFailed(message: string): string {
  return chalk.red(`✖ ${message}`);
}

/**
 * The two lines of the deadline closer: the waiting stopped, the test may not have - and the
 * command that goes on waiting for it.
 */
export function renderWaitTimedOut(timeoutMinutes: number, testIndex?: number): string[] {
  const minutes = timeoutMinutes === 1 ? '1 minute' : `${timeoutMinutes} minutes`;
  return [
    chalk.yellow(`! Stopped waiting after ${minutes}.`),
    testIndex !== undefined
      ? `  Test ${testIndex} may still be running. ${keepWaiting(testIndex)}`
      : chalk.yellow('  The test may still be running in Sherlo.'),
  ];
}

/** The Ctrl-C closer. The run keeps going in Sherlo; only the waiting stops. */
export function renderWaitInterrupted(testIndex?: number): string {
  return testIndex !== undefined
    ? chalk.dim(`Stopped waiting. Test ${testIndex} is still running. `) + keepWaiting(testIndex)
    : chalk.dim('Stopped waiting. The test is still running in Sherlo.');
}

/** The green verdict, as a section: every story either matched or was already approved. */
export function renderVerdictPassed(): string[] {
  // The underline is one longer than the title: `✅` is counted as one character and drawn as two.
  return renderVerdictSection('✅ All stories passed', ['No visual changes need review.'], 21);
}

/**
 * The verdict of a test the SERVER closed without a device run, as init's finished step:
 * `✔ Finished Test 13  no device ran, nothing needed capturing`. No URL - the test has nothing to
 * review. The server's reason is not printed: the step says what a reader needs (content
 * department, review of 2026-10-12).
 */
export function renderVerdictServerBypassed(testIndex?: number): string[] {
  return [
    renderTestStep({
      name: `Finished ${theTest(testIndex)}`,
      detail: 'no device ran, nothing needed capturing',
    }),
  ];
}

/**
 * One screen of the build a wait is closing on - the two fields this closer
 * reads, and nothing else.
 *
 * Spelled here rather than reusing buildView's `ViewStory` because a
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
 * The words a story's status is said in, per wire status - here beside a story the verdict names,
 * and in `sherlo view`'s table: what happened to it (`new`, `changed`, `no changes`), what a person
 * already said (`approved`, `reported`), `needs review`, and `failed` for a capture that failed.
 */
const STORY_STATUS_WORD: Record<string, string> = {
  new: 'new',
  changed: 'changed',
  'review-required': 'needs review',
  rejected: 'reported',
  error: 'failed',
  approved: 'approved',
  unchanged: 'no changes',
  'not-captured': 'carried over',
};

/** A story's status in plain words; a status with no entry is said under its own wire spelling rather than dropped. */
export function storyStatusWord(status: string): string {
  return STORY_STATUS_WORD[status] ?? status;
}

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
 * nobody says less than the tally does. Both fall back to `counts`.
 *
 * As a section, in init's grammar: the title says how many stories need review,
 * then one row per story - its name, and beside it in one column what happened.
 */
export function renderVerdictReviewRequired(
  screens: VerdictScreen[] | undefined,
  counts: { unreviewed: number; reported: number }
): string[] {
  const allScreens = screens ?? [];
  const needAPerson = allScreens.filter((screen) => !SETTLED_STATUSES.has(screen.status));
  if (needAPerson.length === 0) {
    return renderVerdictSection(needReviewTitle(counts.unreviewed + counts.reported), renderCountLines(counts));
  }

  const named = needAPerson.slice(0, NAMED_SCREEN_LIMIT);
  const unnamed = needAPerson.length - named.length;
  const settled = allScreens.length - needAPerson.length;
  const nameWidth = Math.max(...named.map((screen) => screen.name.length));

  return renderVerdictSection(needReviewTitle(needAPerson.length), [
    ...named.map(
      (screen) => `${screen.name.padEnd(nameWidth)}   ${storyStatusWord(screen.status)}`
    ),
    ...(unnamed > 0 ? [`And ${unnamed} more to review.`] : []),
    ...(settled > 0
      ? [chalk.dim(`${settled} other ${settled === 1 ? 'story has' : 'stories have'} no changes.`)]
      : []),
  ]);
}

/** `⚠️ 3 stories need review`, `⚠️ 1 story needs review`. */
function needReviewTitle(count: number): string {
  return `⚠️ ${countStories(count)} ${count === 1 ? 'needs' : 'need'} review`;
}

/**
 * The body when the wait could not name the stories: the reported ones counted, when there are
 * any, then what to do. The title above already counts the ones that need review.
 */
function renderCountLines(counts: { unreviewed: number; reported: number }): string[] {
  const { unreviewed, reported } = counts;

  return [
    ...(reported > 0 ? [`${countStories(reported)} reported`] : []),
    `Open ${unreviewed + reported === 1 ? 'it' : 'them'} in Sherlo to approve or report.`,
  ];
}

/**
 * The infrastructure closer, as init's failed step: the test ended without a verdict. `runError`
 * is server-shaped, so it is stringified, not phrased. The run ends here, so the help block follows.
 */
export function renderVerdictRunErrored(runStatus: string, runError: unknown): string[] {
  return [
    ...renderFailedTestStep('Running the test'),
    `The test ended as "${runStatus}".`,
    ...(runError ? [chalk.dim(`Error: ${JSON.stringify(runError)}`)] : []),
    '',
    ...renderHelpBlock(),
  ];
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
export function renderVerdictNoChanges(): string[] {
  // The underline is one longer than the title: `✅` is counted as one character and drawn as two.
  return renderVerdictSection('✅ No visual changes', ['All snapshots match their baselines.'], 20);
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
  return chalk.dim(`${captured} captured on this branch, ${inherited} carried over unchanged.`);
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
export function renderVerdictNothingRecorded(testIndex?: number): string[] {
  const openIt = testIndex !== undefined ? `Open Test ${testIndex}` : 'Open the test';
  return renderVerdictSection('⚠️ Nothing was recorded', [
    'The test captured no stories and carried none over, so it does not show that nothing',
    `changed. ${openIt} in Sherlo to check.`,
  ]);
}
