/**
 * WHEN THE APP STARTS COLLECTING `sherlo open`'s STORIES, AT THE STORY BROWSER.
 *
 * `sherlo open` sends an app showing itself to the story browser, and the story waits in the
 * bundler's letterbox through the restart. Storybook, starting again, picks a story of its own:
 * the one it remembered, its `initialSelection`, or its first. These tests hold that the story
 * the letterbox hands over is put on screen after that pick, so it is the one that stays.
 *
 * The core here is the suite's fake (./__mocks__/fakeSealedCore), made to do what the real
 * core's loop does when a story is waiting: put it on screen through Storybook's channel at once.
 * The Storybook is a small stand-in that draws whatever story it is told to.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startOpenStoryChannel, stopOpenStoryChannel } from '../openStoryChannel';
import { getSealedCore } from '../sealedCore/loadSealedCore';
import type { StorybookChannel } from '../sealedCore/seam';
import type { FakeSealedCore } from './__mocks__/fakeSealedCore';

const OPENED_STORY = 'typography--scales';
const STORYBOOKS_OWN_PICK = 'typography--dense';

/** A letterbox the test never reaches: the fake core does not ask it. */
const letterbox = { waitForStory: () => new Promise<never>(() => {}) };

/**
 * A Storybook that draws every story it is told to on its channel, and remembers which one is on
 * screen. `preview` is the part of it that names the story it starts on, before it starts.
 */
function makeStorybook() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const channel: StorybookChannel = {
    on: (event, listener) => {
      (listeners[event] ??= []).push(listener);
    },
    off: (event, listener) => {
      listeners[event] = (listeners[event] ?? []).filter((each) => each !== listener);
    },
    emit: (event, ...args) => {
      [...(listeners[event] ?? [])].forEach((listener) => listener(...args));
    },
  };
  const storybook = {
    channel,
    onScreen: null as string | null,
    preview: {
      currentSelection: null as unknown,
      selectionStore: { selectionSpecifier: null as unknown },
    },
    view: null as never,
    /** Storybook's own start: it names its story, then draws it. */
    pickItsOwnFirstStory(storyId: string) {
      storybook.preview.selectionStore.selectionSpecifier = { storySpecifier: storyId };
      channel.emit('setCurrentStory', { storyId });
    },
  };
  storybook.view = { _preview: storybook.preview } as never;

  channel.on('setCurrentStory', (selection) => {
    const { storyId } = selection as { storyId: string };
    storybook.preview.currentSelection = { storyId };
    storybook.onScreen = storyId;
    channel.emit('storyRendered', storyId);
  });

  return storybook;
}

function theFakeCore(): FakeSealedCore {
  return getSealedCore() as FakeSealedCore;
}

/** The fake core's start, saved so each test can put it back. */
const fakeCoreStart = theFakeCore().startOpenStoryChannel;

beforeEach(() => {
  theFakeCore().calls.length = 0;
  // As the real core's loop does when the letterbox already holds a story: start, ask, and put
  // the story it is handed on screen through Storybook's channel.
  theFakeCore().startOpenStoryChannel = (start) => {
    fakeCoreStart(start);
    start.channel.emit('setCurrentStory', { storyId: OPENED_STORY });
  };
});

afterEach(() => {
  stopOpenStoryChannel();
  theFakeCore().startOpenStoryChannel = fakeCoreStart;
});

function theCoreStarted(): boolean {
  return theFakeCore().calls.some((call) => call.method === 'startOpenStoryChannel');
}

describe('an app that restarted into the story browser for `sherlo open`', () => {
  it("a story opened by a restart is not replaced by Storybook's own first pick", () => {
    const storybook = makeStorybook();

    startOpenStoryChannel({
      view: storybook.view,
      channel: storybook.channel,
      atTheStoryBrowser: true,
      letterbox,
    });
    storybook.pickItsOwnFirstStory(STORYBOOKS_OWN_PICK);

    expect(storybook.onScreen).toBe(OPENED_STORY);
  });

  it('starts collecting once Storybook says the story it named is missing', () => {
    const storybook = makeStorybook();
    startOpenStoryChannel({
      view: storybook.view,
      channel: storybook.channel,
      atTheStoryBrowser: true,
      letterbox,
    });

    // Storybook says this once while it is still starting, before it has named any story.
    storybook.channel.emit('storyMissing');
    expect(theCoreStarted()).toBe(false);

    storybook.preview.selectionStore.selectionSpecifier = { storySpecifier: 'no--such-story' };
    storybook.channel.emit('storyMissing', 'no--such-story');
    expect(theCoreStarted()).toBe(true);
  });

  it('starts collecting at once when Storybook already shows a story', () => {
    const storybook = makeStorybook();
    storybook.pickItsOwnFirstStory(STORYBOOKS_OWN_PICK);

    startOpenStoryChannel({
      view: storybook.view,
      channel: storybook.channel,
      atTheStoryBrowser: true,
      letterbox,
    });

    expect(storybook.onScreen).toBe(OPENED_STORY);
  });

  it('starts collecting after 10 seconds when Storybook never says it showed a story', () => {
    vi.useFakeTimers();
    try {
      const storybook = makeStorybook();
      startOpenStoryChannel({
        view: storybook.view,
        channel: storybook.channel,
        atTheStoryBrowser: true,
        letterbox,
      });

      vi.advanceTimersByTime(9999);
      expect(theCoreStarted()).toBe(false);

      vi.advanceTimersByTime(1);
      expect(storybook.onScreen).toBe(OPENED_STORY);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts nothing once it is stopped before Storybook showed its first story', () => {
    const storybook = makeStorybook();
    startOpenStoryChannel({
      view: storybook.view,
      channel: storybook.channel,
      atTheStoryBrowser: true,
      letterbox,
    });

    stopOpenStoryChannel();
    storybook.pickItsOwnFirstStory(STORYBOOKS_OWN_PICK);

    expect(theCoreStarted()).toBe(false);
    expect(storybook.onScreen).toBe(STORYBOOKS_OWN_PICK);
  });
});

describe('an app showing itself', () => {
  it('starts collecting at once: it has no Storybook pick to wait for', () => {
    const storybook = makeStorybook();

    startOpenStoryChannel({
      view: storybook.view,
      channel: storybook.channel,
      atTheStoryBrowser: false,
      letterbox,
    });

    expect(theCoreStarted()).toBe(true);
  });
});
