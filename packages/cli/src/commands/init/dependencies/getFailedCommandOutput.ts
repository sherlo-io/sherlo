import chalk from 'chalk';

const LINES_SHOWN = 15;

/**
 * The last lines a failed command printed on stdout, then the last lines it printed on stderr,
 * each only when it holds text, dimmed and as they are. Both are shown because a command may put
 * its cause on one and noise on the other: `pod install` writes Ruby warnings to stderr and its own
 * `[!]` failure to stdout.
 * Undefined when the command printed nothing - a posed run's error carries no output.
 */
function getFailedCommandOutput(error: unknown): string | undefined {
  const { stdout, stderr } = (error ?? {}) as { stdout?: unknown; stderr?: unknown };

  const lastLinesOfEachStream = [stdout, stderr]
    .filter((stream): stream is string => typeof stream === 'string' && stream.trim() !== '')
    .map((stream) => stream.trimEnd().split('\n').slice(-LINES_SHOWN).join('\n'));
  if (lastLinesOfEachStream.length === 0) return undefined;

  return chalk.dim(lastLinesOfEachStream.join('\n'));
}

export default getFailedCommandOutput;
