/**
 * The routing OUTPUT of `sherlo test`'s staged road.
 *
 * `sherlo test` answers one routing question: can this commit be tested without
 * a native rebuild? The answer is published as CI-AGNOSTIC stdout lines, written
 * together here so they can never drift:
 *
 *   native-needed=<true|false>   the answer itself
 *   reason=<single line>         why, in words a human can read
 *   base-fingerprint=<hash>      which base the answer was measured against
 *
 * The CLI publishes NOTHING else and knows about no CI in particular: the GitHub
 * Action at this repo's root reads these lines and republishes them as step
 * outputs (see actions/lib/cliOutputs.mjs), and any other CI can do the same.
 *
 * ROUTE ON `native-needed`, NOT ON THE EXIT CODE. A genuine tool error (bad
 * token, network failure) throws and prints NO key at all, which is what lets a
 * caller tell a real routing decision from a crash. The exit code (see
 * ./constants) only exists so an unrouted caller still fails closed.
 *
 * This module is the ONLY place the staged road decides that a native build is
 * needed, so the human sentence, the machine keys and the exit code are always
 * the same three faces of one decision.
 */
import chalk from 'chalk';
import { reporting } from '../../helpers';
import printOutputKeys from '../../helpers/printOutputKeys';
import { EXIT_NATIVE_NEEDED, NATIVE_NEEDED_KEY } from './constants';
import { FALLBACK_LINE } from './stagedGateRefusal';

/**
 * The staged fast path is NOT available for this commit: nothing was built,
 * nothing was uploaded, no test ran. Publishes `native-needed=true`, tells the
 * developer what to do, then exits with the contractual code. Never returns.
 *
 * `reason` is the single-line explanation of WHY the fast path is unavailable
 * (a named fingerprint diff, an unregistered base, ...). `details` are extra
 * lines printed verbatim above the sentence - the gate's own diff-bearing
 * refusal text, when the caller has one.
 */
async function reportNativeNeeded({
  reason,
  details = [],
  baseFingerprint,
}: {
  reason: string;
  details?: string[];
  baseFingerprint?: string;
}): Promise<never> {
  for (const detail of details) {
    console.log(chalk.red(`\n${detail}`));
  }

  console.log();
  printOutputKeys({
    [NATIVE_NEEDED_KEY]: true,
    reason,
    'base-fingerprint': baseFingerprint,
  });

  console.log(
    chalk.yellow(
      `\nA native build is required before this commit can be tested: ${reason}.\n` +
        'Nothing was built and no test ran.\n' +
        FALLBACK_LINE
    )
  );

  await reporting.flush().finally(() => {
    process.exit(EXIT_NATIVE_NEEDED);
  });

  // Unreachable - process.exit above never returns. Satisfies the `never`
  // return type when process.exit is stubbed in tests.
  throw new Error('unreachable');
}

export default reportNativeNeeded;

/**
 * The staged fast path IS running this commit to completion. Publishes
 * `native-needed=false` and returns - the run then prints its own capture plan
 * and Review URL as it always has.
 */
export function reportFastPathRunning({ baseFingerprint }: { baseFingerprint: string }): void {
  console.log();
  printOutputKeys({
    [NATIVE_NEEDED_KEY]: false,
    reason: 'the registered base still matches this commit - running JS-only',
    'base-fingerprint': baseFingerprint,
  });
}
