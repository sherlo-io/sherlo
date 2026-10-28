/**
 * SHERLO'S OWN LOG LINES FROM THE APP OFF THE BUNDLER'S LINE - the one reading of the log feed, shared by the
 * capture socket and the live scene, and the one filter that keeps only the strings of a list.
 */
import { askTheBundlerLine } from './bundlerLine';

/**
 * How long the command waits for the bundler's line to read out the app's log lines. The line
 * answers this at once, so any real delay is a bundler that went away.
 */
const LOG_FEED_PATIENCE_MS = 5000;

/**
 * Every log line Sherlo pushed to the line since it booted. An unreachable feed (an app old
 * enough to have never pushed to it, a bundler that went away between the main answer and this
 * read) answers with nothing readable, and that is not this capture's own failure to report.
 */
export async function drainAppLog(port: number): Promise<string[]> {
  return (await readAppLog(port)).logs;
}

/**
 * The same reading as drainAppLog, with the restarts the line counted for the latest launched
 * capture: each time its app took the capture's instruction and then started over. None when the
 * line counted none, or said nothing readable.
 */
export async function readAppLog(port: number): Promise<{ logs: string[]; restarts: number }> {
  const answer = await askTheBundlerLine({
    port,
    question: { action: 'readLogLines' },
    patienceMs: LOG_FEED_PATIENCE_MS,
  });

  if (answer.kind !== 'said') return { logs: [], restarts: 0 };

  const restarts = answer.reply?.restarts;
  return {
    logs: keepStrings(answer.reply?.lines),
    restarts: typeof restarts === 'number' ? restarts : 0,
  };
}

/** The strings of a list off the wire; none when the wire sent no list. */
export function keepStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
