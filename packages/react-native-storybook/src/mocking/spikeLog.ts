import runLog from '../helpers/RunnerBridge/actions/log';

// SPIKE real-app-shape: one diagnostic line on both channels a run is read from - the phone's
// console (Metro's terminal in a debug build) and the run's log (log.sherlo, `sherlo capture`).
// The log action is taken directly, not through RunnerBridge, so the tests that count the
// product's own RunnerBridge lines count only those.
export function spikeLog(message: string, details?: Record<string, unknown>): void {
  const line = `[Sherlo spike] ${message}`;
  // eslint-disable-next-line no-console
  console.log(details ? `${line} ${safeJson(details)}` : line);
  // A diagnostic must never break what it watches (a unit run has no __DEV__, for one).
  try {
    runLog(line, details);
  } catch (_) {
    // The console line above is already out.
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}
