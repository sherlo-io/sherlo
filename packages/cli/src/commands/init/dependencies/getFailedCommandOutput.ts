import chalk from 'chalk';

const LINES_SHOWN = 15;

/**
 * The last lines a failed command printed (its stderr, else its stdout), dimmed, as they are.
 * Undefined when the command printed nothing - a posed run's error carries no output.
 */
function getFailedCommandOutput(error: unknown): string | undefined {
  const { stdout, stderr } = (error ?? {}) as { stdout?: unknown; stderr?: unknown };

  const output = [stderr, stdout].find(
    (stream): stream is string => typeof stream === 'string' && stream.trim() !== ''
  );
  if (!output) return undefined;

  return chalk.dim(output.trimEnd().split('\n').slice(-LINES_SHOWN).join('\n'));
}

export default getFailedCommandOutput;
