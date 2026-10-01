/**
 * STORY_RENDERED readiness + native paint barrier, in the sealed core's walk of one story
 * (testStory, which the SDK's useTestStory hook calls).
 *
 * These tests are MUST-GO-RED: they assert behavior that only exists with the
 * readiness path (STORY_RENDERED subscription + native paint barrier). Swap the
 * readiness logic back for the old substring poll / grab-at-timeout behavior and
 * they fail.
 *
 * What they cover (all SEQUENCING / behavioral, NOT pixel content):
 *  - committed-but-not-painted repro: stabilize must run AFTER the paint barrier
 *  - STORY_RENDERED readiness via a MOCKED channel, EXACT storyId match
 *  - early-buffer: a story that rendered before the walk started waiting
 *  - timeout -> scrollable fallback delay
 *  - paint-barrier sequencing (awaitFrameCommit resolves before stabilize)
 *  - per-scroll-part paint barrier
 */
import type { SealedCoreHost } from '../../../react-native-storybook/src/sealedCore/seam';
import { STORY_ERROR_FALLBACK_TEXT } from '../../../react-native-storybook/src/constants';
import { installTestHost } from './testHost';
import { testStory } from '../src/testStory';
import {
  startStoryRenderedTracking,
  __resetStoryRenderedTrackingForTests,
} from '../src/storyRenderedReadiness';

// The core's preparation of the inspector's tree is stood in for: the tree goes out as it came in,
// with no network image.
vi.mock('../src/prepareInspectorData', () => ({
  prepareInspectorData: (inspectorData: unknown) => ({ inspectorData, hasNetworkImage: false }),
}));

const mockSend = vi.fn();
const mockLog = vi.fn();
const mockGetLastState = vi.fn();
const mockGetConfig = vi.fn();
const mockStabilize = vi.fn();
const mockGetInspectorData = vi.fn();
const mockIsScrollable = vi.fn();
const mockScrollToCheckpoint = vi.fn();
const mockAwaitFrameCommit = vi.fn();

const NO_INSETS = { bottom: 0, top: 0, left: 0, right: 0 };

const FAKE_STORY_ID = 'components-button--primary';
const FAKE_REQUEST_ID = 'req-abc-123';

// Minimal Storybook-channel emitter that records listeners.
function makeChannel() {
  const listeners: Record<string, Array<(...a: any[]) => void>> = {};
  return {
    on: (event: string, cb: (...a: any[]) => void) => {
      (listeners[event] ||= []).push(cb);
    },
    off: (event: string, cb: (...a: any[]) => void) => {
      listeners[event] = (listeners[event] || []).filter((x) => x !== cb);
    },
    emit: (event: string, ...args: any[]) => {
      (listeners[event] || []).slice().forEach((cb) => cb(...args));
    },
  };
}

function makeView(channel: ReturnType<typeof makeChannel>) {
  return { _channel: channel } as any;
}

function makeLastState(storyId = FAKE_STORY_ID, requestId = FAKE_REQUEST_ID) {
  return {
    nextSnapshot: {
      storyId,
      viewId: `${storyId}-deviceHeight`,
      mode: 'deviceHeight' as const,
      displayName: 'components/Button - Primary',
      componentId: 'components-button',
      componentTitle: 'components/Button',
      storyTitle: 'Primary',
      parameters: {},
      argTypes: {},
      args: {},
    },
    requestId,
  };
}

// collectMetadata that does NOT contain the storyId, so the legacy substring
// poll could never resolve from it - readiness MUST come from STORY_RENDERED.
const collectMetadataWithout = () => ({ texts: ['unrelated'], images: [] }) as any;

function walkTheStory(view: ReturnType<typeof makeView>): Promise<void> {
  return testStory({ view, insets: NO_INSETS, collectMetadata: collectMetadataWithout });
}

const FAKE_INSPECTOR_DATA = {
  viewHierarchy: { id: 1, className: 'View', isVisible: true, x: 0, y: 0, width: 390, height: 844 },
  density: 3,
  fontScale: 1,
};

const READINESS_CONFIG = {
  stabilization: {
    requiredMatches: 3,
    minScreenshotsCount: 3,
    intervalMs: 500,
    timeoutMs: 5000,
    saveScreenshots: true,
    threshold: 0,
    includeAA: true,
  },
  scrollableFallbackDelayMs: 3000,
  storyRenderedTimeoutMs: 5000,
  paintBarrierTimeoutMs: 1000,
  paintBarrierPerScrollPart: true,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  __resetStoryRenderedTrackingForTests();

  installTestHost({
    native: {
      getConfigOrDefault: mockGetConfig,
      getLastState: mockGetLastState,
      stabilize: mockStabilize,
      getInspectorData: mockGetInspectorData,
      isScrollable: mockIsScrollable,
      scrollToCheckpoint: mockScrollToCheckpoint,
      awaitFrameCommit: mockAwaitFrameCommit,
    } as unknown as SealedCoreHost['native'],
    runner: { send: mockSend, log: mockLog },
    storyErrors: {
      record: vi.fn(),
      read: () => undefined,
      clear: vi.fn(),
      fallbackText: STORY_ERROR_FALLBACK_TEXT,
    },
  });

  mockGetConfig.mockReturnValue(READINESS_CONFIG);
  mockGetLastState.mockReturnValue(makeLastState());
  mockStabilize.mockResolvedValue(true);
  mockGetInspectorData.mockResolvedValue(FAKE_INSPECTOR_DATA);
  mockIsScrollable.mockResolvedValue({ scrollable: false });
  mockAwaitFrameCommit.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

async function flushAll(ticks = 30): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await vi.runAllTimersAsync();
    await Promise.resolve();
  }
}

describe('useTestStory readiness - STORY_RENDERED', () => {
  it('resolves readiness via STORY_RENDERED exact-id match (substring tree never matches)', async () => {
    const channel = makeChannel();
    // Pre-seed: story rendered before the walk runs (buffered case also).
    startStoryRenderedTracking(channel);
    channel.emit('storyRendered', FAKE_STORY_ID);

    mockSend.mockResolvedValue({
      action: 'ACK_REQUEST_SNAPSHOT',
      nextSnapshot: makeLastState().nextSnapshot,
      requestId: 'req-next',
    });

    walkTheStory(makeView(channel));
    await flushAll();

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REQUEST_SNAPSHOT', storyId: FAKE_STORY_ID })
    );
  });

  it('does NOT resolve on a different storyId (exact equality, not substring)', async () => {
    const channel = makeChannel();
    startStoryRenderedTracking(channel);
    // A different (superstring) id must not satisfy readiness for FAKE_STORY_ID.
    channel.emit('storyRendered', `${FAKE_STORY_ID}-variant`);

    mockSend.mockResolvedValue({
      action: 'ACK_REQUEST_SNAPSHOT',
      nextSnapshot: makeLastState().nextSnapshot,
      requestId: 'req-next',
    });
    mockIsScrollable.mockResolvedValue({ scrollable: false });

    walkTheStory(makeView(channel));
    // Only run microtasks + the storyRenderedTimeoutMs timer once; readiness
    // should fall through to timeout (not match the variant id).
    await vi.advanceTimersByTimeAsync(100);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('early-buffer: a story rendered before useTestStory mounted is not missed', async () => {
    const channel = makeChannel();
    // Tracking attached early (as getStorybook would), event fires, THEN the walk runs.
    startStoryRenderedTracking(channel);
    channel.emit('storyRendered', FAKE_STORY_ID);

    mockSend.mockResolvedValue({
      action: 'ACK_REQUEST_SNAPSHOT',
      nextSnapshot: makeLastState().nextSnapshot,
      requestId: 'req-next',
    });

    walkTheStory(makeView(channel));
    await flushAll();

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ action: 'REQUEST_SNAPSHOT' }));
  });

  it('timeout -> waits the scrollable fallback delay, then still proceeds', async () => {
    const channel = makeChannel(); // present but never emits storyRendered
    mockIsScrollable.mockResolvedValue({
      scrollable: true,
      scrollViewFrame: { x: 0, y: 0, width: 390, height: 844 },
    });
    mockSend.mockResolvedValue({
      action: 'ACK_REQUEST_SNAPSHOT',
      nextSnapshot: makeLastState().nextSnapshot,
      requestId: 'req-next',
    });

    walkTheStory(makeView(channel));
    await flushAll();

    // It must eventually proceed (fallback path), and the paint barrier must run.
    expect(mockAwaitFrameCommit).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ action: 'REQUEST_SNAPSHOT' }));
  });
});

describe('useTestStory readiness - native paint barrier sequencing', () => {
  it('committed-but-not-painted repro: stabilize captures REAL content only because the paint barrier ran first', async () => {
    const channel = makeChannel();
    startStoryRenderedTracking(channel);
    channel.emit('storyRendered', FAKE_STORY_ID);

    // Model the race: STORY_RENDERED fired (committed) but the surface is still
    // the pre-paint blank. The native paint barrier is what flips it to real.
    let surface = 'blank';
    let capturedSurface: string | undefined;

    mockAwaitFrameCommit.mockImplementation(async () => {
      surface = 'real';
      return true;
    });
    mockStabilize.mockImplementation(async () => {
      capturedSurface = surface; // what the screenshot loop would see
      return true;
    });

    mockSend.mockResolvedValue({
      action: 'ACK_REQUEST_SNAPSHOT',
      nextSnapshot: makeLastState().nextSnapshot,
      requestId: 'req-next',
    });

    walkTheStory(makeView(channel));
    await flushAll();

    expect(capturedSurface).toBe('real');
  });

  it('awaitFrameCommit resolves BEFORE the first stabilize call', async () => {
    const channel = makeChannel();
    startStoryRenderedTracking(channel);
    channel.emit('storyRendered', FAKE_STORY_ID);

    mockSend.mockResolvedValue({
      action: 'ACK_REQUEST_SNAPSHOT',
      nextSnapshot: makeLastState().nextSnapshot,
      requestId: 'req-next',
    });

    walkTheStory(makeView(channel));
    await flushAll();

    expect(mockAwaitFrameCommit).toHaveBeenCalled();
    expect(mockStabilize).toHaveBeenCalled();
    const barrierOrder = mockAwaitFrameCommit.mock.invocationCallOrder[0];
    const stabilizeOrder = mockStabilize.mock.invocationCallOrder[0];
    expect(barrierOrder).toBeLessThan(stabilizeOrder);
  });
});

describe('useTestStory readiness - per-scroll-part paint barrier', () => {
  it('runs the paint barrier again before the post-scroll stabilize', async () => {
    const channel = makeChannel();
    startStoryRenderedTracking(channel);
    channel.emit('storyRendered', FAKE_STORY_ID);

    mockIsScrollable.mockResolvedValue({
      scrollable: true,
      scrollViewFrame: { x: 0, y: 0, width: 390, height: 844 },
    });
    mockScrollToCheckpoint.mockResolvedValue({
      reachedBottom: false,
      appliedIndex: 1,
      appliedOffsetPx: 500,
      viewportPx: 844,
      contentPx: 2000,
    });

    mockSend
      .mockResolvedValueOnce({
        action: 'ACK_SCROLL_REQUEST',
        requestId: 'req-scroll-1',
        scrollIndex: 1,
        offsetPx: 500,
      })
      .mockResolvedValueOnce({
        action: 'ACK_REQUEST_SNAPSHOT',
        nextSnapshot: makeLastState().nextSnapshot,
        requestId: 'req-final',
      });

    walkTheStory(makeView(channel));
    await flushAll(40);

    // Initial barrier + per-scroll-part barrier => at least 2 calls.
    expect(mockAwaitFrameCommit.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
