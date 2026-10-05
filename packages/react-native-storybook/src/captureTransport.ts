/**
 * THE APP'S HALF OF THE CAPTURE SOCKET, the open part of it: the road to the bundler.
 *
 * The walk itself - waiting for each story to be on screen, stabilizing it and reading its view
 * tree - is the capture driver in the sealed core (packages/sherlo-core/js/src/captureTransport.ts).
 * What stays here is what talks to the developer's bundler: `bundlerCapture`, the one request held
 * open against the address the bundler serves (metro/captureSocket.js). The shapes of what crosses
 * it - which the command line reads back (packages/cli/src/seams/captureSocket.ts) - are the seam's
 * (./sealedCore/seam), because the core writes them.
 *
 * With no core installed there is no capture: `startCaptureTransport` starts nothing, and
 * `sherlo capture` finds no app waiting.
 */
import { bundlerOrigin } from './bundlerOrigin';
import { getSealedCore } from './sealedCore/loadSealedCore';
import { sherloFetch } from './mocking/network';
import type { CaptureInstruction, CaptureTransport, StorybookChannel } from './sealedCore/seam';
import type { StorybookView } from './types';

/** The one address Sherlo adds to the bundler; the other half of it is metro/captureSocket.js. */
const CAPTURE_PATH = '/sherlo/capture';

/**
 * How long the app leaves a request hanging before it gives up on it. Longer than the bundler's own
 * hold, so an unanswered request means the road itself is gone rather than that there was simply no
 * capture to hand over.
 */
const HOLD_TIMEOUT_MS = 25000;

/**
 * Start waiting on the bundler's capture address: the core's driver walks the captures that arrive
 * on the road. A second call while the first is still collecting is a no-op.
 *
 * `capture` defaults to the bundler this app's JavaScript came from. A built app's JavaScript came
 * from inside the app, so there is no bundler beside it and no address to wait on: nothing starts,
 * and `sherlo capture` is refused by the tool rather than waited on by anybody. With no sealed core
 * nothing starts either.
 */
export function startCaptureTransport({
  view,
  channel,
  capture,
}: {
  view: StorybookView;
  channel: StorybookChannel | null;
  capture?: CaptureTransport | null;
}): void {
  if (!channel) return;
  const core = getSealedCore();
  if (!core) return;

  const road = capture === undefined ? bundlerCapture() : capture;
  if (!road) return;

  core.startCaptureTransport({ view, channel, capture: road });
}

/** Stop waiting. The request already in flight is left to finish and its answer dropped. */
export function stopCaptureTransport(): void {
  getSealedCore()?.stopCaptureTransport();
}

/**
 * The capture address on the bundler this app's JavaScript came from, or null when it did not come
 * from one. React Native names that bundler in the url it loaded the bundle from; a built app names
 * a file on the device instead, and a file has no capture address.
 */
export function bundlerCapture(): CaptureTransport | null {
  const origin = bundlerOrigin();
  if (!origin) return null;

  return {
    waitForACapture: async (saying) => {
      const giveUp = new AbortController();
      const timer = setTimeout(() => giveUp.abort(), HOLD_TIMEOUT_MS);

      try {
        const response = await sherloFetch(origin + CAPTURE_PATH, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saying),
          // React Native's own declaration of a fetch signal is not the standard one this
          // controller produces, though the runtime object is the same - hence the cast.
          signal: giveUp.signal as unknown as RequestInit['signal'],
        });
        const answer = (await response.json()) as CaptureInstruction;
        return answer && typeof answer === 'object' ? answer : {};
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
