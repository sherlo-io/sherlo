/**
 * SIMPLIFIED protocol-loop test for the sealed core's walk of one story (testStory, which the
 * SDK's useTestStory hook calls).
 *
 * What this test covers:
 *  - Basic REQUEST_SNAPSHOT flow: lastState present → readiness (no-channel quick
 *    path) → stabilize → inspector data → REQUEST_SNAPSHOT sent with correct
 *    action/storyId/requestId
 *  - Protocol message fields: hasError, isStable, inspectorData present
 *  - ACK_SCROLL_REQUEST loop: scrollToCheckpoint called → next REQUEST_SNAPSHOT sent
 *  - isAtEnd flag set correctly when scrollToCheckpoint returns reachedBottom=true
 *
 * What is STUBBED / simplified:
 *  - the safe-area insets → static zeroes
 *  - prepareInspectorData() → returns input inspector data unchanged + hasNetworkImage=false
 *  - No Storybook channel is wired, so the (now unconditional) readiness path
 *    resolves immediately via its no-channel quick path; awaitFrameCommit is
 *    mocked to resolve true for the paint barrier that follows
 *  - vi.useFakeTimers() replaces real setTimeout (vi.runAllTimersAsync() flushes)
 *  - the story error registry reads undefined; its clear is a no-op
 *
 * Whether a capture's launch runs the walk at all is the hook's own question, tested in the SDK
 * (packages/react-native-storybook/src/__tests__/useTestStory.test.ts).
 *
 * For realistic device validation see sherlo-tester scroll-capture.spec.ts.
 */
import type { SealedCoreHost } from '../../../react-native-storybook/src/sealedCore/seam';
import { STORY_ERROR_FALLBACK_TEXT } from '../../../react-native-storybook/src/constants';
import { installTestHost } from './testHost';
import { testStory } from '../src/testStory';
import { __resetStoryRenderedTrackingForTests } from '../src/storyRenderedReadiness';

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

// The app's metadata, as the SDK's MetadataProvider collects it.
const collectMetadata = () => ({ texts: [FAKE_STORY_ID], images: [] }) as any;

/** The walk with no Storybook view, so readiness takes its no-channel quick path. */
function walkTheStory(): Promise<void> {
  return testStory({ view: undefined, insets: NO_INSETS, collectMetadata });
}

const FAKE_INSPECTOR_DATA = {
  viewHierarchy: { id: 1, className: 'View', isVisible: true, x: 0, y: 0, width: 390, height: 844 },
  density: 3,
  fontScale: 1,
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

  mockGetConfig.mockReturnValue({
    stabilization: {
      requiredMatches: 3,
      minScreenshotsCount: 3,
      intervalMs: 500,
      timeoutMs: 5000,
      saveScreenshots: true,
      threshold: 0,
      includeAA: true,
    },
    // Readiness knobs represented here so the config shape matches the real one.
    scrollableFallbackDelayMs: 3000,
    storyRenderedTimeoutMs: 5000,
    paintBarrierTimeoutMs: 1000,
    paintBarrierPerScrollPart: true,
  });

  mockGetLastState.mockReturnValue(makeLastState());
  mockStabilize.mockResolvedValue(true);
  mockGetInspectorData.mockResolvedValue(FAKE_INSPECTOR_DATA);
  mockIsScrollable.mockResolvedValue({ scrollable: false });
  // With the readiness path now unconditional, the walk always runs the
  // native paint barrier. No view/channel is passed here, so readiness takes
  // the no-channel quick path (non-scrollable => no fallback delay) and the
  // REQUEST_SNAPSHOT / ACK_SCROLL_REQUEST loop below is exercised as before.
  mockAwaitFrameCommit.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

async function flushAll(ticks = 20): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await vi.runAllTimersAsync();
    await Promise.resolve();
  }
}

describe('useTestStory protocol - basic REQUEST_SNAPSHOT flow', () => {
  it('sends REQUEST_SNAPSHOT with action, storyId, and requestId', async () => {
    mockSend.mockResolvedValue({
      action: 'ACK_REQUEST_SNAPSHOT',
      nextSnapshot: makeLastState().nextSnapshot,
      requestId: 'req-next',
    });

    walkTheStory();
    await flushAll();

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REQUEST_SNAPSHOT',
        storyId: FAKE_STORY_ID,
        requestId: FAKE_REQUEST_ID,
      })
    );
  });

  it('REQUEST_SNAPSHOT message includes inspectorData, isStable, and hasError=false', async () => {
    mockSend.mockResolvedValue({
      action: 'ACK_REQUEST_SNAPSHOT',
      nextSnapshot: makeLastState().nextSnapshot,
      requestId: 'req-next',
    });

    walkTheStory();
    await flushAll();

    const call = mockSend.mock.calls[0][0];
    expect(call.hasError).toBe(false);
    expect(call.isStable).toBe(true);
    expect(call.inspectorData).toBeDefined();
  });

  it('does nothing when lastState is undefined', async () => {
    mockGetLastState.mockReturnValue(undefined);
    walkTheStory();
    await flushAll();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('useTestStory protocol - ACK_SCROLL_REQUEST loop', () => {
  it('calls scrollToCheckpoint then sends a second REQUEST_SNAPSHOT with updated requestId', async () => {
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

    mockScrollToCheckpoint.mockResolvedValue({
      reachedBottom: false,
      appliedIndex: 1,
      appliedOffsetPx: 500,
      viewportPx: 844,
      contentPx: 2000,
    });

    walkTheStory();
    await flushAll(30);

    expect(mockScrollToCheckpoint).toHaveBeenCalledWith(1, 500, 50);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][0]).toMatchObject({
      action: 'REQUEST_SNAPSHOT',
      requestId: 'req-scroll-1',
    });
  });

  it('sets isAtEnd=true in second REQUEST_SNAPSHOT when scrollToCheckpoint returns reachedBottom', async () => {
    mockSend
      .mockResolvedValueOnce({
        action: 'ACK_SCROLL_REQUEST',
        requestId: 'req-s',
        scrollIndex: 1,
        offsetPx: 100,
      })
      .mockResolvedValueOnce({
        action: 'ACK_REQUEST_SNAPSHOT',
        nextSnapshot: makeLastState().nextSnapshot,
        requestId: 'req-end',
      });

    mockScrollToCheckpoint.mockResolvedValue({
      reachedBottom: true,
      appliedIndex: 1,
      appliedOffsetPx: 100,
      viewportPx: 844,
      contentPx: 844,
    });

    walkTheStory();
    await flushAll(30);

    const secondCall = mockSend.mock.calls[1][0];
    expect(secondCall.isAtEnd).toBe(true);
  });
});
