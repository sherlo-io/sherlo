/**
 * THE SINK - the one impure end of the render layer, and the only thing an
 * expectation producer replaces.
 *
 *     logic  --emit(segment)-->  renderSegment  -->  SINK  -->  stdout | buffer
 *
 * The default sink writes each segment to the process's streams the instant it
 * is emitted, which is why extracting the render layer changed nothing a user
 * sees: `sherlo test --dry-run` still prints `🤖 Building android bundle...`
 * before the bundler runs, not after the whole run is known. A producer installs
 * a buffering sink instead and gets exactly the same bytes in an array.
 *
 * WHY THE SINK IS A MODULE-LEVEL VARIABLE RATHER THAN A THREADED PARAMETER.
 * Print sites sit at the bottom of call chains the CLI's control flow already
 * owns (`stagedRun` -> the bundling loop -> `runDryRunPreview`), and threading a
 * sink through every one of them would be a large diff whose only content is
 * plumbing - exactly the "while I'm here" churn an extraction must not carry. A
 * CLI process runs ONE command, so a per-process sink is the honest scope. It is
 * never swapped concurrently: {@link captureTranscript} installs and restores it
 * around a synchronous-in-spirit render, and nothing else writes it.
 */
import { format } from 'util';
import { renderSegment } from '../render/renderSegment';
import type { TranscriptSegment, TranscriptSink } from '../render/segments';

/**
 * The shipped sink: one `console.log` / `console.warn` call per print entry,
 * with that entry's arguments passed through verbatim. This is byte-for-byte
 * what each print site did before the render layer existed.
 */
const consoleSink: TranscriptSink = (segment) => {
  const { stream, prints } = renderSegment(segment);
  for (const args of prints) {
    if (stream === 'stderr') console.warn(...args);
    else console.log(...args);
  }
};

let currentSink: TranscriptSink = consoleSink;

/** Emit one segment through whichever sink is installed. */
export function emit(segment: TranscriptSegment): void {
  currentSink(segment);
}

/** The two streams a captured transcript is made of. */
export type CapturedTranscript = { stdout: string; stderr: string };

/**
 * Run `body` with a buffering sink installed and return the bytes it emitted.
 *
 * `util.format` is node's OWN console formatter, so a buffered `console.warn('x',
 * err)` reproduces the bytes the real stream would have carried rather than a
 * re-implementation of node's object formatting. Each print entry ends in one
 * `\n`, which is what `console.log` appends.
 *
 * The previous sink is restored even when `body` throws, so a producer that
 * refuses mid-render leaves the process printing normally.
 */
export async function captureTranscript(body: () => Promise<void>): Promise<CapturedTranscript> {
  const captured: CapturedTranscript = { stdout: '', stderr: '' };
  const previousSink = currentSink;

  currentSink = (segment) => {
    const { stream, prints } = renderSegment(segment);
    for (const args of prints) {
      captured[stream] += `${format(...args)}\n`;
    }
  };

  try {
    await body();
  } finally {
    currentSink = previousSink;
  }

  return captured;
}
