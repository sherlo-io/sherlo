/**
 * THE APP'S HALF OF THE CAPTURE SOCKET - the JavaScript that walks one story for `sherlo capture`.
 *
 * Four facts are pinned here, one per describe:
 *
 *   - the walk IS the test-run walk: put the story on screen through Storybook's own channel, wait
 *     for STORY_RENDERED, close the last-frame gap, stabilize, and read the view tree - told and
 *     answered over a socket instead of the runner's file, and that is the whole of the difference.
 *   - a capture restarts the app into testing mode: an app that is not in testing mode is told to
 *     restart there, and that restart is what makes isRunningVisualTests true for the story it
 *     records. The app records nothing on the way out.
 *   - nothing touches the device's storage: a test run saves screenshots and writes the protocol
 *     file; a capture stabilizes with saveScreenshots off and never reads or writes a file.
 *   - the two facts the tool prints beside the tree - how many screenfuls the story is, and whether
 *     it carries an image loaded over the network - are read off the story the run reads them from.
 *
 * The bundler is injected as a `capture` (a CaptureTransport), so no real bundler or NativeModules
 * source is needed - the same way openStoryChannel.test.ts injects the letterbox.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetMode,
  mockGetConfig,
  mockStabilize,
  mockAwaitFrameCommit,
  mockGetInspectorData,
  mockIsScrollable,
  mockScrollToCheckpoint,
  mockOpenTesting,
  mockAppendFile,
  mockReadFile,
} = vi.hoisted(() => ({
  mockGetMode: vi.fn(),
  mockGetConfig: vi.fn(),
  mockStabilize: vi.fn(),
  mockAwaitFrameCommit: vi.fn(),
  mockGetInspectorData: vi.fn(),
  mockIsScrollable: vi.fn(),
  mockScrollToCheckpoint: vi.fn(),
  mockOpenTesting: vi.fn(),
  mockAppendFile: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('../SherloModule', () => ({
  default: {
    getMode: mockGetMode,
    getConfig: mockGetConfig,
    stabilize: mockStabilize,
    awaitFrameCommit: mockAwaitFrameCommit,
    getInspectorData: mockGetInspectorData,
    isScrollable: mockIsScrollable,
    scrollToCheckpoint: mockScrollToCheckpoint,
    openTesting: mockOpenTesting,
    appendFile: mockAppendFile,
    readFile: mockReadFile,
  },
}));

import {
  startCaptureTransport,
  stopCaptureTransport,
  type CaptureTransport,
  type CapturedAnswer,
} from '../captureTransport';
import { __resetStoryRenderedTrackingForTests } from '../getStorybook/components/TestingMode/useTestAllStories/storyRenderedReadiness';
import { rememberStoryOfTheApp } from '../componentNames';

const STORY = 'components-button--primary';

/** The config a test run reads, with the readiness knobs the walk falls back to. */
const CONFIG = {
  stabilization: {
    requiredMatches: 3,
    minScreenshotsCount: 6,
    intervalMs: 500,
    timeoutMs: 20000,
    threshold: 0.1,
    includeAA: true,
  },
  storyRenderedTimeoutMs: 5000,
  paintBarrierTimeoutMs: 1000,
};

/** The stabilization numbers the bundler hands over, as the runner writes them today. */
const SETTINGS = {
  requiredMatches: 3,
  minScreenshotsCount: 6,
  intervalMs: 500,
  timeoutMs: 20000,
};

/** A two-node view tree, to prove the walk reads children too. */
const INSPECTOR_DATA = {
  viewHierarchy: {
    id: 1,
    className: 'RCTView',
    isVisible: true,
    x: 0,
    y: 0,
    width: 390,
    height: 844,
    children: [
      { id: 2, className: 'RCTTextView', isVisible: true, x: 0, y: 0, width: 100, height: 20 },
    ],
  },
  density: 3,
  fontScale: 1,
};

/** What the app says about itself every time it asks. */
type Saying = { mode: string; stories: string[]; answer: CapturedAnswer | null };

/** One screenful: the story is exactly as tall as the screen it is drawn in. */
const ONE_SCREENFUL = {
  reachedBottom: true,
  appliedIndex: 0,
  appliedOffsetPx: 0,
  viewportPx: 800,
  contentPx: 800,
};

/** A story three screens tall, measured by the scroll view it is drawn in. */
const THREE_SCREENFULS = { ...ONE_SCREENFUL, contentPx: 2400 };

beforeEach(() => {
  vi.clearAllMocks();
  __resetStoryRenderedTrackingForTests();
  mockGetMode.mockReturnValue('testing');
  mockGetConfig.mockReturnValue(CONFIG);
  mockStabilize.mockResolvedValue(true);
  mockAwaitFrameCommit.mockResolvedValue(true);
  mockGetInspectorData.mockResolvedValue(INSPECTOR_DATA);
  // By default the story fits the screen it is drawn in: nothing scrolls, and nothing under the
  // story loads an image over the network.
  mockIsScrollable.mockResolvedValue({ scrollable: false });
  mockScrollToCheckpoint.mockResolvedValue(ONE_SCREENFUL);
});

afterEach(() => {
  stopCaptureTransport();
  __resetStoryRenderedTrackingForTests();
  rememberStoryOfTheApp(undefined);
});

/** The app's Storybook view, as much of it as this road reads. */
function makeView() {
  return { _storyIndex: { entries: { [STORY]: {} } } } as never;
}

describe('a capture runs the same story path a test run does, and differs only in how it is told and how it answers', () => {
  it('walks the same story path a test run does', async () => {
    const channel = makeChannel();
    const asked: Saying[] = [];
    const answered = new Promise<CapturedAnswer>((resolve) => {
      const capture: CaptureTransport = {
        waitForACapture: async (saying) => {
          asked.push(saying);
          if (saying.answer) {
            resolve(saying.answer);
            return new Promise(() => {}); // the app goes on waiting; the test is done asking
          }
          return { storyId: STORY, settings: SETTINGS };
        },
      };
      startCaptureTransport({ view: makeView(), channel, capture });
    });

    // The story is put on screen through Storybook's own channel, then reported rendered.
    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );
    channel.emit('storyRendered', STORY);

    const answer = await answered;

    // The same path a test run walks: put on screen, close the last-frame gap, stabilize, read the
    // tree. Told by name over the socket, and answered over the same socket - nothing else differs.
    expect(asked[0]).toEqual({ mode: 'testing', stories: [STORY], answer: null });
    expect(mockAwaitFrameCommit).toHaveBeenCalledWith(1000);
    expect(mockStabilize).toHaveBeenCalledWith(3, 6, 500, 20000, false, 0.1, true);
    expect(mockGetInspectorData).toHaveBeenCalled();
    expect(answer).toEqual({
      kind: 'captured',
      storyId: STORY,
      settled: { ms: expect.any(Number), frames: 6 },
      tree: {
        primitive: 'RCTView',
        components: [],
        children: [{ primitive: 'RCTTextView', components: [], children: [] }],
      },
    });
  });
});

describe('a capture restarts the app into testing mode, so isRunningVisualTests is true for the story it records', () => {
  it('restarts the app so isRunningVisualTests is true', async () => {
    mockGetMode.mockReturnValue('default');

    const asked: Saying[] = [];
    const capture: CaptureTransport = {
      waitForACapture: async (saying) => {
        asked.push(saying);
        return { restartIntoTesting: true };
      },
    };
    startCaptureTransport({ view: makeView(), channel: makeChannel(), capture });

    // This app is not in testing mode, so it is told to restart there. openTesting is the restart -
    // the app that comes back reports `testing`, which is what makes isRunningVisualTests true. The
    // story is recorded by that app, not this one: nothing is walked on the way out.
    await vi.waitFor(() => expect(mockOpenTesting).toHaveBeenCalledTimes(1));

    expect(asked).toEqual([{ mode: 'default', stories: [STORY], answer: null }]);
    expect(mockStabilize).not.toHaveBeenCalled();
    expect(mockGetInspectorData).not.toHaveBeenCalled();
    expect(mockAwaitFrameCommit).not.toHaveBeenCalled();
  });
});

describe("a capture reads and writes nothing in the device's storage", () => {
  it('reads and writes nothing in storage', async () => {
    const channel = makeChannel();
    const answered = new Promise<CapturedAnswer>((resolve) => {
      const capture: CaptureTransport = {
        waitForACapture: async (saying) => {
          if (saying.answer) {
            resolve(saying.answer);
            return new Promise(() => {});
          }
          return { storyId: STORY, settings: SETTINGS };
        },
      };
      startCaptureTransport({ view: makeView(), channel, capture });
    });

    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );
    channel.emit('storyRendered', STORY);
    await answered;

    // A test run saves screenshots and writes the protocol file; a capture does neither. The tree is
    // read in memory, straight from the inspector, and saveScreenshots is off.
    expect(mockAppendFile).not.toHaveBeenCalled();
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockStabilize).toHaveBeenCalledWith(3, 6, 500, 20000, false, 0.1, true);
  });
});

/* ========================================================================== */

/** Storybook's channel, as much of it as this road uses. */
function makeChannel() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const emitted: Array<[string, unknown]> = [];

  return {
    on: (event: string, listener: (...args: unknown[]) => void) => {
      (listeners[event] ||= []).push(listener);
    },
    off: (event: string, listener: (...args: unknown[]) => void) => {
      listeners[event] = (listeners[event] || []).filter((other) => other !== listener);
    },
    emit: (event: string, ...args: unknown[]) => {
      emitted.push([event, args[0]]);
      (listeners[event] || []).slice().forEach((listener) => listener(...args));
    },
    emitted: (event: string) =>
      emitted.filter(([name]) => name === event).map(([, payload]) => payload),
  };
}
