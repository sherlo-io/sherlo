/**
 * Ends the process with `code` once stdout and stderr have taken every byte written so far.
 *
 * When a stream is a pipe, Node may write it asynchronously: a bare `process.exit` right after a
 * large print ends the process with the tail of the output still queued, and the reader gets text
 * cut in the middle (a JSON that does not parse). A write of nothing calls back only after the
 * writes before it are done, so waiting for that callback on each stream makes the exit whole.
 *
 * A reader that stops reading would hold the exit for ever, so the wait is bounded: after
 * OUTPUT_WAIT_LIMIT_MS the process ends with the same code.
 */
export const OUTPUT_WAIT_LIMIT_MS = 5000;

function settled(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    stream.write('', () => resolve());
  });
}

export default async function exitAfterOutput(code: number): Promise<void> {
  let giveUp: NodeJS.Timeout | undefined;
  const limit = new Promise<void>((resolve) => {
    giveUp = setTimeout(resolve, OUTPUT_WAIT_LIMIT_MS);
  });
  await Promise.race([Promise.all([settled(process.stdout), settled(process.stderr)]), limit]);
  clearTimeout(giveUp);
  process.exit(code);
}
