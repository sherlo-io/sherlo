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
 * The events that tell Storybook has put a story of its own on screen: it drew one, the story
 * threw, or the story it looked for is not there.
 */
const STORYBOOK_LANDED_EVENTS = [
  'storyRendered',
  'storyErrored',
  'storyThrewException',
  'storyMissing',
];

/**
 * How long the app waits for Storybook to show its own first story before it opens the letterbox
 * anyway. Storybook loads every story first, which takes a second or two; a Storybook that never
 * says it showed one must not leave `sherlo open` waiting on an app that never asks.
 */
const STORYBOOKS_FIRST_STORY_TIMEOUT_MS = 10000;

/** Stops waiting for Storybook's own first story, while the app is still waiting for it. */
let stopWaitingForStorybooksFirstStory: (() => void) | null = null;

/**
 * Start waiting on the bundler's letterbox: the core's loop puts each story it is handed on screen.
 * A second call while the first is still collecting is a no-op.
 *
 * `atTheStoryBrowser` says which side of the door this app is on: true while it is showing
 * Storybook, false while it is showing itself.
 *
 * AT THE STORY BROWSER, THE LETTERBOX OPENS ONLY ONCE STORYBOOK HAS SHOWN ITS OWN FIRST STORY.
 * Storybook picks a story of its own when it starts (the one it remembered, its
 * `initialSelection`, or the first one), and it does so only after it has loaded every story. A
 * story `sherlo open` left in the letterbox while the app restarted would otherwise be put on
 * screen first, and then replaced by Storybook's pick, after the tool had already said it was on
 * screen. The letterbox keeps the story until the app asks, so waiting costs nothing. A Storybook
 * already showing a story has made its pick, and the letterbox opens at once.
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

  const startTheCore = () =>
    core.startOpenStoryChannel({ view, channel, atTheStoryBrowser, letterbox: road });

  if (!atTheStoryBrowser || view._preview?.currentSelection) {
    startTheCore();
    return;
  }

  if (stopWaitingForStorybooksFirstStory) return;
  stopWaitingForStorybooksFirstStory = whenStorybookShowsItsFirstStory({ view, channel }, () => {
    stopWaitingForStorybooksFirstStory = null;
    startTheCore();
  });
}

/** Stop waiting. The request already in flight is left to finish and its answer dropped. */
export function stopOpenStoryChannel(): void {
  stopWaitingForStorybooksFirstStory?.();
  stopWaitingForStorybooksFirstStory = null;
  getSealedCore()?.stopOpenStoryChannel();
}

/**
 * Call `then` once, when Storybook has shown the story it picks for itself on starting, or when
 * STORYBOOKS_FIRST_STORY_TIMEOUT_MS has passed without it saying so. Returns the way to stop
 * waiting.
 *
 * Storybook says a story is missing once before it has picked anything, while it is still
 * starting; that one is not its pick. Storybook names what it is looking for (`selectionSpecifier`)
 * before it looks, so a missing story counts only once that name is set.
 */
function whenStorybookShowsItsFirstStory(
  { view, channel }: { view: StorybookView; channel: StorybookChannel },
  then: () => void
): () => void {
  const listeners = STORYBOOK_LANDED_EVENTS.map((event) => {
    const listener = () => {
      const storybookHasNamedItsStory = Boolean(view._preview?.selectionStore?.selectionSpecifier);
      if (event === 'storyMissing' && !storybookHasNamedItsStory) return;
      stopWaiting();
      then();
    };
    return { event, listener };
  });

  const giveUpWaiting = setTimeout(() => {
    stopWaiting();
    then();
  }, STORYBOOKS_FIRST_STORY_TIMEOUT_MS);

  function stopWaiting(): void {
    clearTimeout(giveUpWaiting);
    listeners.forEach(({ event, listener }) => channel.off(event, listener));
  }

  listeners.forEach(({ event, listener }) => channel.on(event, listener));
  return stopWaiting;
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
