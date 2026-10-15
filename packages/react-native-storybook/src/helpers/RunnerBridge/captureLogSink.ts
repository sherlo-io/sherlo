/**
 * THE LIVE LOG SINK - the plug the seam's `setCaptureLogSink` offers a core, beside the connection
 * every log line already goes over (./actions/log).
 *
 * A log line reaches `sherlo capture` over the app's connection: log() sends it as a `log` message
 * the instant it is formed, and the bundler's line keeps it in its log feed (metro/sherloLine.js),
 * in a process that outlives the app's own crash. That road needs nothing plugged in here.
 *
 * A SINK, NOT A QUEUE. This module holds no lines of its own and remembers nothing between calls.
 * With no sink plugged in, pushAppLogLine is a no-op.
 */

let sink: ((line: string) => void) | undefined;

/** Plug in (or remove, with `undefined`) the function a capture pushes each log line through. */
export function setCaptureLogSink(next: ((line: string) => void) | undefined): void {
  sink = next;
}

/** Hand one already-formatted log line to whichever sink is registered - a no-op with none. */
export function pushAppLogLine(line: string): void {
  sink?.(line);
}
