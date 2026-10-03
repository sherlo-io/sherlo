/*
 * EXIT CODE CONTRACT
 * =============================================================================
 * Mirrors the GitHub check-state mapping decided for the sherlo/visual-tests
 * check, so the CI exit code and the GitHub check conclusion never drift.
 *
 *   0 - GREEN:  build finished, every story noChanges or already approved
 *               (zero unreviewed, zero reported).
 *   1 - BLOCK:  build finished with unreviewed or reported/denied changes.
 *               A human must review in the dashboard.
 *   2 - ERROR:  build ended in a build/system error (infrastructure/capture
 *               failure, canceled, or authentication/permission denied).
 *   3 - TIMEOUT: --wait-timeout elapsed before reaching a terminal state.
 *               Conservative - timeout is a BLOCK, never a pass.
 *   130 - SIGINT: the user pressed Ctrl-C while waiting. The run keeps going
 *               in Sherlo; we stop cleanly and exit with the conventional
 *               128+SIGINT(2) code.
 *
 * GitHub check mapping (for reference):
 *   exit 0 → conclusion: "success"
 *   exit 1 → conclusion: "action_required"
 *   exit 2 → conclusion: "failure"
 *   exit 3 → conclusion: "action_required" (timeout)
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
export const EXIT_SIGINT = 130;
