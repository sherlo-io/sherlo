/**
 * THE APP'S HALF OF THE LETTERBOX - the JavaScript that waits on the bundler's address and puts
 * the story it is handed on screen.
 *
 * It holds one request open against the address the bundler serves (metro/openStoryLetterbox.js),
 * saying what stories this app has and which one it has painted. The answer is the next story to
 * show; then it asks again, and that next asking - carrying the story it has just painted - is the
 * app's answer to whoever posted it.
 *
 * IT REPLACES THE STORY ON SCREEN WHERE IT STANDS. A request from outside cannot wait for a
 * restart, so the story travels Storybook's own channel, the same way Storybook's UI moves between
 * stories. The runner's road is the other one and is not this: it names a story before Storybook
 * opens and starts the screen over for the next.
 *
 * CHANNEL / EVENT-NAME CHOICE. `setCurrentStory` is a literal for the same reason `storyRendered`
 * and `storyChanged` are elsewhere in this SDK: the `storybook` core package is only a peer
 * dependency of `@storybook/react-native` and is not guaranteed to be resolvable from here, while
 * the event name itself is part of Storybook's stable wire protocol on 8.x and 9.x alike.
 */
import { NativeModules } from 'react-native';
import { StorybookView } from './types';
import {
  lastRenderedStory,
  startStoryRenderedTracking,
  waitForStoryRendered,
  type StorybookChannel,
} from './getStorybook/components/TestingMode/useTestAllStories/storyRenderedReadiness';

const SET_CURRENT_STORY = 'setCurrentStory';

/** The one address Sherlo adds to the bundler; the other half of it is metro/openStoryLetterbox.js. */
const LETTERBOX_PATH = '/sherlo/letterbox';

/**
 * How long the app leaves a request hanging before it gives up on it. Longer than the bundler's own
 * hold, so an unanswered request means the road itself is gone rather than that there was simply no
 * story to hand over.
 */
const HOLD_TIMEOUT_MS = 25000;

/** How long to leave the address alone after it failed to answer, rather than spin on a closed door. */
const RETRY_AFTER_SILENCE_MS = 2000;

/** How long the app waits for a story it was handed to reach the screen before asking again. */
const PAINT_TIMEOUT_MS = 10000;

/** What the app asks of the letterbox, and nothing else. */
export type BundlerLetterbox = {
  /**
   * Hold a request open at the bundler until there is a story for this app, saying what this app
   * has and what is on screen now. Resolves with the story to show, or null when the hold ran out
   * with nothing posted.
   */
  waitForStory(saying: { stories: string[]; showing: string | null }): Promise<string | null>;
};

let collecting = false;

/**
 * Start waiting on the bundler's address. Idempotent - a second call while the first is still
 * collecting is a no-op, because there is one app and one channel to put stories on.
 *
 * `letterbox` defaults to the bundler this app's JavaScript came from. A built app's JavaScript
 * came from inside the app, so there is no bundler beside it and no letterbox to wait on: nothing
 * starts, and `sherlo open` is refused by the tool rather than waited on by anybody.
 */
export function startOpenStoryChannel({
  view,
  channel,
  letterbox,
}: {
  view: StorybookView;
  channel: StorybookChannel | null;
  letterbox?: BundlerLetterbox | null;
}): void {
  if (collecting || !channel) return;

  const road = letterbox === undefined ? bundlerLetterbox() : letterbox;
  if (!road) return;

  // The same tracker the readiness wait uses: it buffers the story last rendered, which is both
  // what `waitForStoryRendered` reads and what this app reports as being on screen.
  startStoryRenderedTracking(channel);

  collecting = true;
  collectStories({ view, channel, letterbox: road });
}

/** Stop waiting. The request already in flight is left to finish and its answer dropped. */
export function stopOpenStoryChannel(): void {
  collecting = false;
}

/* ========================================================================== */

async function collectStories({
  view,
  channel,
  letterbox,
}: {
  view: StorybookView;
  channel: StorybookChannel;
  letterbox: BundlerLetterbox;
}): Promise<void> {
  while (collecting) {
    let storyId: string | null = null;

    try {
      storyId = await letterbox.waitForStory({
        stories: storiesIn(view),
        showing: lastRenderedStory() ?? null,
      });
    } catch (_e) {
      await delay(RETRY_AFTER_SILENCE_MS);
      continue;
    }

    if (!collecting || !storyId) continue;

    channel.emit(SET_CURRENT_STORY, { storyId });
    // Ask again only once the story is on screen, so the asking carries the answer.
    await waitForStoryRendered({ storyId, timeoutMs: PAINT_TIMEOUT_MS, channel });
  }
}

/** Every story this app has, as Storybook's own index inside it knows them. */
function storiesIn(view: StorybookView): string[] {
  const index = (view as unknown as { _storyIndex?: { entries?: Record<string, unknown> } })
    ._storyIndex;
  return index?.entries ? Object.keys(index.entries) : [];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        const response = await fetch(origin + LETTERBOX_PATH, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saying),
          // React Native's own declaration of a fetch signal is not the standard one this
          // controller produces, though the runtime object is the same - hence the cast.
          signal: giveUp.signal as unknown as RequestInit['signal'],
        });
        const answer = (await response.json()) as { storyId?: unknown };
        return typeof answer?.storyId === 'string' ? answer.storyId : null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function bundlerOrigin(): string | null {
  const sourceCode = NativeModules.SourceCode as
    | { getConstants?: () => { scriptURL?: string }; scriptURL?: string }
    | undefined;
  const scriptURL = sourceCode?.getConstants?.().scriptURL ?? sourceCode?.scriptURL;
  if (typeof scriptURL !== 'string') return null;

  const origin = /^(https?:\/\/[^/]+)/.exec(scriptURL);
  return origin ? origin[1] : null;
}
