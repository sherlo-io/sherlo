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
 * AN APP SHOWING ITSELF GOES TO THE STORY BROWSER. `sherlo open` is for a developer who wants to
 * see one story right now rather than launch the app and find it, so an app that is not at the
 * story browser and is told a story is waiting goes there. Getting there costs a restart and
 * nothing waiting inside the app survives one, which is exactly why the letterbox holds the story
 * rather than handing it over: this app collects it after it comes back.
 *
 * CHANNEL / EVENT-NAME CHOICE. `setCurrentStory` is a literal for the same reason `storyRendered`
 * and `storyChanged` are elsewhere in this SDK: the `storybook` core package is only a peer
 * dependency of `@storybook/react-native` and is not guaranteed to be resolvable from here, while
 * the event name itself is part of Storybook's stable wire protocol on 8.x and 9.x alike.
 */
import { NativeModules } from 'react-native';
import { StorybookView } from './types';
import openStorybook from './openStorybook';
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

/** What the letterbox answers an app that has been waiting. */
export type LetterboxAnswer = {
  /** The story to put on screen. Only ever sent to an app that is at the story browser. */
  storyId?: string | null;
  /** A story is waiting, and this app has to reach the story browser to collect it. */
  goToTheStoryBrowser?: boolean;
};

/** What the app asks of the letterbox, and nothing else. */
export type BundlerLetterbox = {
  /**
   * Hold a request open at the bundler until there is something for this app, saying what this app
   * has, where it is, and what is on screen now. Resolves with an empty answer when the hold ran
   * out with nothing posted.
   */
  waitForStory(saying: {
    stories: string[];
    showing: string | null;
    atTheStoryBrowser: boolean;
  }): Promise<LetterboxAnswer>;
};

let collecting = false;

/**
 * Start waiting on the bundler's address. Idempotent - a second call while the first is still
 * collecting is a no-op, because there is one app and one channel to put stories on.
 *
 * `atTheStoryBrowser` says which side of the door this app is on: true while it is showing
 * Storybook, false while it is showing itself. The two wait on the same address and are answered
 * differently - one is handed stories, the other is sent to where stories can be shown.
 *
 * `letterbox` defaults to the bundler this app's JavaScript came from. A built app's JavaScript
 * came from inside the app, so there is no bundler beside it and no letterbox to wait on: nothing
 * starts, and `sherlo open` is refused by the tool rather than waited on by anybody.
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
  if (collecting || !channel) return;

  const road = letterbox === undefined ? bundlerLetterbox() : letterbox;
  if (!road) return;

  // The same tracker the readiness wait uses: it buffers the story last rendered, which is both
  // what `waitForStoryRendered` reads and what this app reports as being on screen.
  startStoryRenderedTracking(channel);

  collecting = true;
  collectStories({ view, channel, atTheStoryBrowser, letterbox: road });
}

/** Stop waiting. The request already in flight is left to finish and its answer dropped. */
export function stopOpenStoryChannel(): void {
  collecting = false;
}

/* ========================================================================== */

async function collectStories({
  view,
  channel,
  atTheStoryBrowser,
  letterbox,
}: {
  view: StorybookView;
  channel: StorybookChannel;
  atTheStoryBrowser: boolean;
  letterbox: BundlerLetterbox;
}): Promise<void> {
  while (collecting) {
    let answer: LetterboxAnswer;

    try {
      answer = await letterbox.waitForStory({
        stories: storiesIn(view),
        showing: lastRenderedStory() ?? null,
        atTheStoryBrowser,
      });
    } catch (_e) {
      await delay(RETRY_AFTER_SILENCE_MS);
      continue;
    }

    if (!collecting) return;

    if (answer.goToTheStoryBrowser) {
      // This app is on its way out: changing mode restarts it, and the story it is going to fetch
      // is still in the letterbox for the app that comes back to collect. Stop waiting here rather
      // than ask again - if the restart never happens, the next launch collects it instead.
      collecting = false;
      openStorybook();
      return;
    }

    if (!answer.storyId) continue;

    const { storyId } = answer;
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
        const answer = (await response.json()) as LetterboxAnswer;
        return answer && typeof answer === 'object' ? answer : {};
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
