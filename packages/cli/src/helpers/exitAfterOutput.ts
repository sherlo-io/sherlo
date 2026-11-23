/**
 * Ends the process with `code` once stdout and stderr have taken every byte written so far.
 *
 * When a stream is a pipe, Node may write it asynchronously: a bare `process.exit` right after a
 * large print ends the process with the tail of the output still queued, and the reader gets text
 * cut in the middle (a JSON that does not parse). A write of nothing calls back only after the
 * writes before it are done, so waiting for that callback on each stream makes the exit whole.
 */
function settled(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    stream.write('', () => resolve());
  });
}

export default async function exitAfterOutput(code: number): Promise<void> {
  await Promise.all([settled(process.stdout), settled(process.stderr)]);
  process.exit(code);
}
