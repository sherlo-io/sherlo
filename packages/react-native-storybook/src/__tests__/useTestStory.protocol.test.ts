/**
 * SIMPLIFIED protocol-loop test for useTestStory.
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
 *  - useSafeAreaInsets() → static zeroes
 *  - prepareInspectorData() → returns input inspector data unchanged + hasNetworkImage=false
 *  - No Storybook channel is wired, so the (now unconditional) readiness path
 *    resolves immediately via its no-channel quick path; awaitFrameCommit is
 *    mocked to resolve true for the paint barrier that follows
 *  - vi.useFakeTimers() replaces real setTimeout (vi.runAllTimersAsync() flushes)
 *  - readStoryError() returns undefined; clearStoryError() is a no-op
 *  - React useEffect runs synchronously via mock
 *
 * For realistic device validation see sherlo-tester scroll-capture.spec.ts.
 */

const {
  mockSend,
  mockLog,
  mockGetLastState,
  mockGetConfig,
  mockStabilize,
  mockGetInspectorData,
  mockIsScrollable,
  mockScrollToCheckpoint,
  mockAwaitFrameCommit,
} = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockLog: vi.fn(),
  mockGetLastState: vi.fn(),
  mockGetConfig: vi.fn(),
  mockStabilize: vi.fn(),
  mockGetInspectorData: vi.fn(),
  mockIsScrollable: vi.fn(),
  mockScrollToCheckpoint: vi.fn(),
  mockAwaitFrameCommit: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (fn: () => void | (() => void), _deps?: any[]) => { fn(); },
  };
});

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));

vi.mock('../helpers', () => ({
  RunnerBridge: { send: mockSend, log: mockLog },
  isExpoGo: false,
}));

vi.mock('../SherloModule', () => ({
  default: {
    getConfig: mockGetConfig,
    getLastState: mockGetLastState,
    stabilize: mockStabilize,
    getInspectorData: mockGetInspectorData,
    isScrollable: mockIsScrollable,
    scrollToCheckpoint: mockScrollToCheckpoint,
    awaitFrameCommit: mockAwaitFrameCommit,
  },
}));

vi.mock('../getStorybook/storyErrorRegistry', () => ({
  readStoryError: () => undefined,
  clearStoryError: vi.fn(),
}));

vi.mock('../getStorybook/components/TestingMode/useTestAllStories/prepareInspectorData', () => ({
  prepareInspectorData: (inspectorData: any) => ({
    inspectorData,
    hasNetworkImage: false,
  }),
}));

import useTestStory from '../getStorybook/components/TestingMode/useTestAllStories/useTestStory';

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

function makeMetadataRef(storyId = FAKE_STORY_ID) {
  return {
    current: {
      collectMetadata: () => ({
        texts: [storyId],
        images: [],
      }),
    },
  } as any;
}

const FAKE_INSPECTOR_DATA = {
  viewHierarchy: { id: 1, className: 'View', isVisible: true, x: 0, y: 0, width: 390, height: 844 },
  density: 3,
  fontScale: 1,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();

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
  // With the readiness path now unconditional, useTestStory always runs the
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

    useTestStory({ metadataProviderRef: makeMetadataRef() });
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

    useTestStory({ metadataProviderRef: makeMetadataRef() });
    await flushAll();

    const call = mockSend.mock.calls[0][0];
    expect(call.hasError).toBe(false);
    expect(call.isStable).toBe(true);
    expect(call.inspectorData).toBeDefined();
  });

  it('does nothing when lastState is undefined', async () => {
    mockGetLastState.mockReturnValue(undefined);
    useTestStory({ metadataProviderRef: makeMetadataRef() });
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

    useTestStory({ metadataProviderRef: makeMetadataRef() });
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

    useTestStory({ metadataProviderRef: makeMetadataRef() });
    await flushAll(30);

    const secondCall = mockSend.mock.calls[1][0];
    expect(secondCall.isAtEnd).toBe(true);
  });
});
