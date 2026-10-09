/**
 * THE APP'S HALF OF THE LETTERBOX, the open part of it: the road to the bundler.
 *
 * The collect loop - wait for a story, put it on screen through Storybook's channel, ask again with
 * what was painted - is in the sealed core, which the SDK packs and does not hold the source of. What
 * stays here is what talks to the developer's bundler: `bundlerLetterbox`, the one request held open
 * against the address the bundler serves (metro/openStoryLetterbox.js). The shapes of what crosses
 * it are the seam's (./sealedCore/seam), because the core writes them.
 *
 * With no core installed there is no `sherlo open`: `startOpenStoryChannel` starts nothing.
 */
import { bundlerOrigin } from './bundlerOrigin';
import { bundlerCapture } from './captureTransport';
import { getSealedCore } from './sealedCore/loadSealedCore';
import { sherloFetch } from './mocking/network';
import type { BundlerLetterbox, LetterboxAnswer, StorybookChannel } from './sealedCore/seam';
import type { StorybookView } from './types';

/** The one address Sherlo adds to the bundler; the other half of it is metro/openStoryLetterbox.js. */
const LETTERBOX_PATH = '/sherlo/letterbox';

/**
 * How long the app leaves a request hanging before it gives up on it. Longer than the bundler's own
 * hold, so an unanswered request means the road itself is gone rather than that there was simply no
 * story to hand over.
 */
const HOLD_TIMEOUT_MS = 25000;

/**
 * Start waiting on the bundler's letterbox: the core's loop puts each story it is handed on screen.
 * A second call while the first is still collecting is a no-op.
 *
 * `atTheStoryBrowser` says which side of the door this app is on: true while it is showing
 * Storybook, false while it is showing itself.
 *
 * `letterbox` defaults to the bundler this app's JavaScript came from. A built app's JavaScript
 * came from inside the app, so there is no bundler beside it and no letterbox to wait on: nothing
 * starts, and `sherlo open` is refused by the tool rather than waited on by anybody. With no sealed
 * core nothing starts either.
 */
export function startOpenStoryChannel({
  view,
  channel,
  atTheStoryBrowser,
  letterbox,
}: {
  view: StorybookView;
  channel: StorybookChannel | null;
  atTheStoryBrowser: boolean;
  letterbox?: BundlerLetterbox | null;
}): void {
  if (!channel) return;
  const core = getSealedCore();
  if (!core) return;

  const road = letterbox === undefined ? bundlerLetterbox() : letterbox;
  if (!road) return;

  core.startOpenStoryChannel({ view, channel, atTheStoryBrowser, letterbox: road });
}

/** Stop waiting. The request already in flight is left to finish and its answer dropped. */
export function stopOpenStoryChannel(): void {
  getSealedCore()?.stopOpenStoryChannel();
}

/**
 * Start waiting as the app, for `sherlo open` and `sherlo capture` both. Sherlo's launch entry calls
 * this on Storybook's default setup when the app launches in default mode: the app's own entry runs
 * there, with no Storybook loaded, so there is no Storybook view or channel to hand the core, only
 * the two roads to the bundler.
 *
 * A built app's JavaScript came from inside the app, with no bundler beside it, so nothing starts.
 * With no sealed core nothing starts either.
 */
export function startWaitingAsTheApp(): void {
  const core = getSealedCore();
  if (!core) return;

  const letterbox = bundlerLetterbox();
  const capture = bundlerCapture();
  if (!letterbox || !capture) return;

  core.startWaitingAsTheApp({ letterbox, capture });
}

/**
 * The letterbox on the bundler this app's JavaScript came from, or null when it did not come from
 * one. React Native names that bundler in the url it loaded the bundle from; a built app names a
 * file on the device instead, and a file has no letterbox.
 */
export function bundlerLetterbox(): BundlerLetterbox | null {
  const origin = bundlerOrigin();
  if (!origin) return null;

  return {
    waitForStory: async (saying) => {
      const giveUp = new AbortController();
      const timer = setTimeout(() => giveUp.abort(), HOLD_TIMEOUT_MS);

      try {
        const response = await sherloFetch(origin + LETTERBOX_PATH, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saying),
          // React Native's own declaration of a fetch signal is not the standard one this
          // controller produces, though the runtime object is the same - hence the cast.
          signal: giveUp.signal as unknown as RequestInit['signal'],
        });
        const answer = (await response.json()) as LetterboxAnswer;
        return answer && typeof answer === 'object' ? answer : {};
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
