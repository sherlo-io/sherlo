import chalk from 'chalk';
import printResultsUrl from '../printResultsUrl';
import { POLL_INTERVAL_MS, WAIT_TIMEOUT_MINUTES } from './constants';
import { BuildStatusSource } from './types';

/**
 * Polls `statusSource` on a fixed interval until the build reaches a
 * terminal state or the wait times out, then sets `process.exitCode` per the
 * exit-code contract (0/1/2/3/130) and reprints the dashboard URL. Never
 * throws - every exit path (terminal, timeout, poll error, SIGINT) resolves
 * normally so the command can finish and exit with the code that was set.
 */
async function runWaitLoop({
  statusSource,
  url,
  maxWaitTimeMinutes,
  now = Date.now,
}: {
  statusSource: BuildStatusSource;
  url: string;
  /** Overrides `WAIT_TIMEOUT_MINUTES` for this run when provided (e.g. `--maxWaitTime`). */
  maxWaitTimeMinutes?: number;
  /**
   * Injectable clock so the deadline tests can stub time deterministically
   * instead of spying on the global `Date.now` - keeps them immune to any
   * other `Date.now` caller in the process (e.g. a test reporter timestamping
   * console output) under any test reporter.
   */
  now?: () => number;
}): Promise<void> {
  const waitTimeoutMinutes = maxWaitTimeMinutes ?? WAIT_TIMEOUT_MINUTES;
  const waitTimeoutMs = waitTimeoutMinutes * 60 * 1000;

  console.log(
    `⏳ Waiting for the test run to finish (times out after ${waitTimeoutMinutes} minutes)...\n`
  );

  const deadline = now() + waitTimeoutMs;
  const sigint = createSigintSignal();

  try {
    while (true) {
      if (now() >= deadline) {
        console.error(
          `⌛ ${chalk.yellow(
            `Deadline passed after ${waitTimeoutMinutes}min - the run is still open`
          )}\n`
        );
        printResultsUrl(url);
        process.exitCode = 3;
        return;
      }

      const polled = await Promise.race([
        statusSource
          .poll()
          .then((result) => ({ type: 'result' as const, result }))
          .catch((error) => ({ type: 'error' as const, error })),
        sigint.promise.then(() => ({ type: 'sigint' as const })),
      ]);

      if (polled.type === 'sigint') {
        console.log(`${chalk.dim('Stopped waiting. The run is still going in Sherlo:')}\n`);
        printResultsUrl(url);
        process.exitCode = 130;
        return;
      }

      if (polled.type === 'error') {
        console.error((polled.error as Error).message);
        printResultsUrl(url);
        process.exitCode = 2;
        return;
      }

      if (polled.result.terminal) {
        if (polled.result.hasChangesToReview) {
          console.log(`🟠 ${chalk.yellow('Run finished - snapshots require review')}\n`);
        } else {
          console.log(`✅ ${chalk.green('Run finished - nothing is waiting on a human')}\n`);
        }
        printResultsUrl(url);
        process.exitCode = polled.result.hasChangesToReview ? 1 : 0;
        return;
      }

      const remainingMs = Math.max(deadline - now(), 0);
      const waited = await Promise.race([
        delay(Math.min(POLL_INTERVAL_MS, remainingMs)).then(() => 'elapsed' as const),
        sigint.promise.then(() => 'sigint' as const),
      ]);

      if (waited === 'sigint') {
        console.log(`${chalk.dim('Stopped waiting. The run is still going in Sherlo:')}\n`);
        printResultsUrl(url);
        process.exitCode = 130;
        return;
      }
    }
  } finally {
    sigint.cleanup();
  }
}

export default runWaitLoop;

/* ========================================================================== */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Overrides Node's default "exit immediately" SIGINT behavior so the wait
 * loop can stop cleanly, reprint the dashboard URL, and exit(130) itself
 * instead of killing the process mid-print.
 */
function createSigintSignal(): { promise: Promise<void>; cleanup: () => void } {
  let resolveSignal: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveSignal = resolve;
  });

  const handler = () => resolveSignal();
  process.once('SIGINT', handler);

  return { promise, cleanup: () => process.off('SIGINT', handler) };
}
