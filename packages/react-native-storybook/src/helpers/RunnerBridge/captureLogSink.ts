/**
 * THE LIVE LOG PUSH - the second sink log() writes to, beside the file a real run's runner tails
 * (./actions/log).
 *
 * A capture holds a live socket to the same app a run does, and until now everything RunnerBridge.log
 * formed - the story error boundary, the paint barrier, the mocking shims, every "why did this
 * happen" line the SDK already writes - reached nobody down that road (see ../../captureTransport.ts).
 *
 * ONE LINE, ONE PUSH, THE INSTANT IT IS FORMED - never batched into the capture's own answer. The
 * failure this exists to help diagnose lives inside a two-second window in the walk itself; an app
 * that hangs or dies inside that window never reaches the point of assembling an answer at all, so a
 * design that carried log lines home INSIDE the answer would lose exactly the lines that matter most.
 * Pushing each line to the bundler as it is formed puts it in a process that outlives the app's own
 * crash (see ../../captureTransport.ts's registration of the sink, and metro/captureLogSocket.js on
 * the other end), so `sherlo capture` can still read back what happened even when the walk itself
 * never finishes.
 *
 * A SINK, NOT A QUEUE. This module holds no lines of its own and remembers nothing between calls -
 * it is only the seam captureTransport.ts plugs a real pusher into while a capture is actually
 * waiting (registered in startCaptureTransport, cleared in stopCaptureTransport). Every other caller
 * of log() - a real runner's test session, a built app with no bundler beside it - has no sink
 * registered, so pushAppLogLine is a no-op for them, the same way appendFile already is a no-op
 * write for a runner that never asked for one.
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
