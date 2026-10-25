/**
 * THE APP'S HALF OF THE CAPTURE SOCKET, the open part of it: the road to the bundler.
 *
 * The walk itself - waiting for each story to be on screen, stabilizing it and reading its view
 * tree - is the capture driver in the sealed core, which the SDK packs and does not hold the source of.
 * What stays here is what carries it to the developer's bundler: `bundlerCapture`, one wait at a time
 * over the app's connection, answered by the capture relay in the bundler's line
 * (metro/sherloLine.js). The shapes of what crosses it - which the command line reads back
 * (packages/cli/src/seams/captureSocket.ts) - are the seam's (./sealedCore/seam), because the core
 * writes them.
 *
 * With no core installed there is no capture: `startCaptureTransport` starts nothing, and
 * `sherlo capture` finds no app waiting.
 */
import { bundlerOrigin } from './bundlerOrigin';
import bundledScenes from './bundledScenes';
import { logTheLine, sendAndAwaitAnswer } from './connection/appLine';
import { readStorybookChannel } from './getStorybook/storybookReads';
import { getSealedCore } from './sealedCore/loadSealedCore';
import type { CaptureTransport, StorybookChannel } from './sealedCore/seam';

/**
 * How long the app waits for the capture relay's answer before it gives up on it. Longer than the
 * line's own hold, so no answer means the road itself is gone rather than that there was simply no
 * capture to hand over.
 */
const ANSWER_TIMEOUT_MS = 25000;

/**
 * Start waiting on the bundler's capture relay: the core's driver walks the captures that arrive
 * on the road. A second start while one is collecting does nothing (the core's own guard), so the
 * start may come from `getStorybook` or from the scene boot (`startCaptureOfTheLaunch`), whichever
 * runs first. It answers whether the core was handed the road.
 *
 * `capture` defaults to the bundler this app's JavaScript came from. A built app's JavaScript came
 * from inside the app, so there is no bundler beside it and no relay to wait on: nothing starts,
 * and `sherlo capture` is refused by the tool rather than waited on by anybody. With no sealed core
 * nothing starts either.
 */
export function startCaptureTransport({
  channel,
  capture,
}: {
  channel: StorybookChannel | null;
  capture?: CaptureTransport | null;
}): boolean {
  if (!channel) return false;
  const core = getSealedCore();
  if (!core) return false;

  const road = capture === undefined ? bundlerCapture() : capture;
  if (!road) return false;

  core.startCaptureTransport({ channel, capture: road });
  return true;
}

/**
 * A capture launch of an app whose Storybook is not Sherlo's: `getStorybook` never runs, so nobody
 * else asks the bundler's line for the capture. The scene boot calls this once Storybook has
 * started; the core starts once while collecting, so `getStorybook` running too is fine. The caller
 * has decided the launch is a capture (./captureLaunch). When the transport cannot start, the
 * phone's log says so, so a capture that finds no app is not silent on this side.
 */
export function startCaptureOfTheLaunch(): void {
  try {
    if (startCaptureTransport({ channel: readStorybookChannel().value })) return;
  } catch (error) {
    logTheLine(`could not start waiting for a capture: ${String(error)}`);
    return;
  }
  logTheLine('could not start waiting for a capture: no Storybook channel or no sealed core');
}

/** Stop waiting. The wait already sent is left to be answered, and its answer dropped. */
export function stopCaptureTransport(): void {
  getSealedCore()?.stopCaptureTransport();
}

/**
 * The capture relay on the bundler this app's JavaScript came from, or null when it did not come
 * from one. React Native names that bundler in the url it loaded the bundle from; a built app names
 * a file on the device instead, and a file has no capture relay.
 *
 * Each wait also says the scenes this bundle holds (./bundledScenes), so the relay refuses a scene
 * the bundle lacks instead of handing it to an app that would capture its first screen.
 */
export function bundlerCapture(): CaptureTransport | null {
  if (!bundlerOrigin()) return null;

  return {
    waitForACapture: (saying) =>
      sendAndAwaitAnswer(
        { action: 'waitForACapture', scenes: Object.keys(bundledScenes), ...saying },
        'captureInstruction',
        ANSWER_TIMEOUT_MS
      ),
  };
}
