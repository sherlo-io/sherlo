/**
 * THE LETTERBOX'S COLLECT LOOP - the app's half of `sherlo open`, in the sealed core: it waits on
 * the bundler's letterbox and puts the story it is handed on screen.
 *
 * The road to the bundler stays open, in the SDK (its openStoryChannel.ts, `bundlerLetterbox`,
 * beside metro/openStoryLetterbox.js): the SDK hands it in, and every message on it is the SDK's to
 * shape. What this file holds is what the app does with the road: say what stories this app has
 * and which one it has painted. The answer is the next story to show; then it asks again, and that
 * next asking - carrying the story it has just painted - is the app's answer to whoever posted it.
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
 * AND IT SAYS WHETHER THAT STORY BROKE. A story that threw while rendering records what it threw
 * in the one registry the error boundary fills (the host's storyErrors), and the app reports that
 * alongside the story it painted - so `sherlo open` tells a developer their story is broken from
 * the same fact the runner already trusts, rather than deciding it a second way.
 *
 * CHANNEL / EVENT-NAME CHOICE. `setCurrentStory` is a literal for the same reason `storyRendered`
 * and `storyChanged` are elsewhere in this SDK: the `storybook` core package is only a peer
 * dependency of `@storybook/react-native` and is not guaranteed to be resolvable from here, while
 * the event name itself is part of Storybook's stable wire protocol on 8.x and 9.x alike.
 */
import type {
  BundlerLetterbox,
  LetterboxAnswer,
  StoryThrew,
  StorybookChannel,
  OpaqueStorybookView as StorybookView,
} from '../../../react-native-storybook/src/sealedCore/seam';
import { theHost } from './host';
import {
  lastRenderedStory,
  startStoryRenderedTracking,
  waitForStoryRendered,
} from './storyRenderedReadiness';

const SET_CURRENT_STORY = 'setCurrentStory';

/** How long to leave the address alone after it failed to answer, rather than spin on a closed door. */
const RETRY_AFTER_SILENCE_MS = 2000;

/** How long the app waits for a story it was handed to reach the screen before asking again. */
const PAINT_TIMEOUT_MS = 10000;

let collecting = false;

/**
 * Start waiting on the bundler's letterbox, through the road the SDK hands in. Idempotent - a
 * second call while the first is still collecting is a no-op, because there is one app and one
 * channel to put stories on.
 *
 * `atTheStoryBrowser` says which side of the door this app is on: true while it is showing
 * Storybook, false while it is showing itself. The two wait on the same address and are answered
 * differently - one is handed stories, the other is sent to where stories can be shown.
 */
export function startOpenStoryChannel({
  view,
  channel,
  atTheStoryBrowser,
  letterbox,
}: {
  view: StorybookView;
  channel: StorybookChannel;
  atTheStoryBrowser: boolean;
  letterbox: BundlerLetterbox;
}): void {
  if (collecting) return;

  // The same tracker the readiness wait uses: it buffers the story last rendered, which is both
  // what `waitForStoryRendered` reads and what this app reports as being on screen.
  startStoryRenderedTracking(channel);

  collecting = true;
  collectStories({ view, channel, atTheStoryBrowser, letterbox });
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

    const showing = lastRenderedStory() ?? null;

    try {
      answer = await letterbox.waitForStory({
        stories: storiesIn(view),
        showing,
        atTheStoryBrowser,
        threw: showing === null ? null : whatTheStoryThrew(showing),
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
      theHost().native.openStorybook();
      return;
    }

    if (!answer.storyId) continue;

    const { storyId } = answer;
    channel.emit(SET_CURRENT_STORY, { storyId });
    // Ask again only once the story is on screen, so the asking carries the answer.
    await waitForStoryRendered({ storyId, timeoutMs: PAINT_TIMEOUT_MS, channel });
  }
}

/**
 * What the story on screen threw while rendering, or null when it drew cleanly.
 *
 * Read from the registry the error boundary fills and the runner already reads (the host's
 * storyErrors) - there is ONE way of knowing a story is broken in this SDK, and this is a second
 * reader of it rather than a second way. The stack and component stack it also holds are left
 * behind: what reaches a developer's terminal is the error's own words.
 */
function whatTheStoryThrew(storyId: string): StoryThrew | null {
  const recorded = theHost().storyErrors.read(storyId);
  return recorded ? { name: recorded.name, message: recorded.message } : null;
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
