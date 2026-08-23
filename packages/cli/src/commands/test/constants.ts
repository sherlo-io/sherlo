import { TEST_COMMAND } from '../../constants';

export const THIS_COMMAND = TEST_COMMAND;
export type THIS_COMMAND = typeof THIS_COMMAND;

/*
 * EXIT CODE CONTRACT - `sherlo test`
 * =============================================================================
 * ROUTE ON THE OUTPUT, NOT ON THE EXIT CODE. Every staged-road run prints a
 * machine-readable `native-needed=<true|false>` line on stdout. A caller decides
 * what to do next by reading that key. The exit code exists so an UNROUTED
 * caller still fails closed - it is never the routing signal.
 *
 *   0                   - the run completed. Either the staged fast path ran to
 *                          completion (`native-needed=false`), or, with
 *                          `--wait`, the wait contract's GREEN.
 *   EXIT_NATIVE_NEEDED  - the staged fast path is not available for this commit
 *                          (`native-needed=true`): nothing was built, nothing
 *                          was uploaded, no test ran. The caller is expected to
 *                          build natively and re-run as
 *                          `sherlo test --android <path> [--ios <path>]`.
 *                          This is an EXPECTED outcome, never a crash: no error
 *                          report, no "Need Help?" footer.
 *   1 / 2 / 3 / 130     - with `--wait`, the wait contract (see WAIT_OPTION):
 *                          1 = changes require review, 2 = build/system error,
 *                          3 = timeout, 130 = interrupted.
 *   any other non-zero  - a GENUINE tool error (bad token, network failure).
 *                          A tool error writes NO output key, which is the
 *                          reliable discriminator for a CI gate.
 *
 * EXIT_NATIVE_NEEDED deliberately sits outside the `--wait` code range so that
 * `sherlo test --wait` can never report "native build needed" as GREEN.
 * =============================================================================
 */
export const EXIT_NATIVE_NEEDED = 4;

/** The stdout key that carries the routing answer. */
export const NATIVE_NEEDED_KEY = 'native-needed';
