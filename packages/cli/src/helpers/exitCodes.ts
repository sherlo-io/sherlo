/*
 * EXIT CODE CONTRACT
 * =============================================================================
 * Mirrors the GitHub check-state mapping decided for the sherlo/visual-tests
 * check, so the CI exit code and the GitHub check conclusion never drift.
 *
 *   0 - GREEN:  build finished, every story noChanges or already approved
 *               (zero unreviewed, zero reported).
 *   1 - BLOCK:  build finished with reported/denied changes.
 *               A human must review in the dashboard.
 *   2 - ERROR:  build ended in a build/system error (infrastructure/capture
 *               failure, canceled, or authentication/permission denied).
 *   3 - TIMEOUT: --wait-timeout elapsed before reaching a terminal state.
 *               Conservative - timeout is a BLOCK, never a pass.
 *   4 - REVIEW: build finished with unreviewed changes and nothing reported.
 *               Not a failure: a human only has to look and approve.
 *   130 - SIGINT: the user pressed Ctrl-C while waiting. The run keeps going
 *               in Sherlo; we stop cleanly and exit with the conventional
 *               128+SIGINT(2) code.
 *
 * GitHub check mapping (for reference):
 * (as sherlo-api's mapBuildStateToCheckRun sends it: reported → failure,
 * unreviewed → action_required, errored → failure, systemErrored → neutral,
 * cancelled → cancelled)
 *   exit 0 → conclusion: "success"
 *   exit 1 → conclusion: "failure" (a reported change)
 *   exit 2 → conclusion: "failure" ("neutral" when Sherlo itself broke)
 *   exit 3 → no conclusion of its own (the CLI's own wait ran out)
 *   exit 4 → conclusion: "action_required" (unreviewed changes only)
 *
 * -----------------------------------------------------------------------------
 * WHERE THE CONTRACT IS KNOWN TO HOLD, AND WHERE IT DID NOT.
 *
 * The "never drift" claim above was FALSE for one input, and the sparse-build
 * verdict (helpers/sparseBuildVerdict.ts) is the repair. A build that finished
 * with `unreviewed: 0, reported: 0` because it RECORDED NOTHING exits 0 here
 * while the check, re-deriving its own state from the same all-zero tally,
 * posts `action_required`. Under the server-sent gate the wait loop routes its
 * finished branch through the sparse decider, which reads the capture
 * accounting the check reads and lands on the same answer. Ungated, this file's
 * mapping is exactly what it has always been.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS ITS OWN MODULE. These constants used to live in
 * waitForBuildResult.ts, which is also where the wait loop lives. Once that loop
 * had to call `decideSparseBuildVerdict`, and the decider had to name the exit
 * codes it decides, the two modules formed a runtime import cycle. A contract
 * that two modules both depend on is a third thing, so it is a third file - and
 * the loop now imports its codes rather than owning them.
 * =============================================================================
 */

export const EXIT_GREEN = 0;
export const EXIT_BLOCK = 1;
export const EXIT_ERROR = 2;
export const EXIT_TIMEOUT = 3;
/** The build finished with unreviewed changes and nothing reported: a human only has to look. */
export const EXIT_REVIEW = 4;
export const EXIT_SIGINT = 130;
/** 128 + SIGTERM(15): the process was told to terminate. */
export const EXIT_SIGTERM = 143;

/** A finished run that is not green: BLOCK when a change is reported, else REVIEW. */
export function exitCodeForUnfinishedReview(reported: number): number {
  return reported > 0 ? EXIT_BLOCK : EXIT_REVIEW;
}
