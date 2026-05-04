import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock react's useEffect to execute the callback synchronously so we can test the hook logic
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (fn: () => void | (() => void), _deps?: any[]) => {
      fn();
    },
  };
});

vi.mock('../helpers', () => ({
  RunnerBridge: {
    send: vi.fn().mockResolvedValue({}),
    log: vi.fn(),
  },
  isExpoGo: false,
}));

vi.mock('../SherloModule', () => ({
  default: {
    getLastState: vi.fn().mockReturnValue(undefined),
  },
}));

vi.mock('../getStorybook/components/TestingMode/useTestAllStories/prepareSnapshots', () => ({
  default: vi.fn().mockReturnValue([]),
}));

import useSetInitialTestingData, {
  waitForStorybookReady,
} from '../getStorybook/components/TestingMode/useTestAllStories/useSetInitialTestingData';
import { RunnerBridge } from '../helpers';
import SherloModule from '../SherloModule';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

/* -------------------------------------------------------------------------- */
/* waitForStorybookReady                                                       */
/* -------------------------------------------------------------------------- */

describe('waitForStorybookReady', () => {
  it('returns true immediately when view._idToPrepared already has stories', async () => {
    const view = {
      _idToPrepared: { 'button--primary': { id: 'button--primary' } },
    } as any;

    const result = await waitForStorybookReady(view);

    expect(result).toBe(true);
  });

  it('returns false after 10 seconds when _idToPrepared stays empty', async () => {
    vi.useFakeTimers();

    const view = { _idToPrepared: {} } as any;

    const promise = waitForStorybookReady(view);

    // Advance past the 10-second deadline (function polls every 500 ms)
    await vi.advanceTimersByTimeAsync(10_001);

    const result = await promise;

    expect(result).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* useSetInitialTestingData                                                    */
/* -------------------------------------------------------------------------- */

describe('useSetInitialTestingData', () => {
  it('sends START with empty snapshots when waitForStorybookReady returns false (no stories loaded)', async () => {
    vi.useFakeTimers();

    // No stories in the view - waitForStorybookReady will time out after 10 s
    const view = { _idToPrepared: {} } as any;

    // Calling the hook starts the async flow inside useEffect
    useSetInitialTestingData({ view });

    // Advance clock past the 10-second timeout so waitForStorybookReady resolves
    await vi.advanceTimersByTimeAsync(10_001);

    // Flush microtasks created after waitForStorybookReady returns (prepareSnapshots + send)
    await Promise.resolve();
    await Promise.resolve();

    expect(RunnerBridge.send).toHaveBeenCalledWith({
      action: 'START',
      snapshots: [],
    });
  });

  it('returns early and does NOT send START when lastState exists', async () => {
    vi.useFakeTimers();

    (SherloModule.getLastState as ReturnType<typeof vi.fn>).mockReturnValue({
      requestId: 'abc',
      nextSnapshot: null,
    });

    const view = { _idToPrepared: {} } as any;

    useSetInitialTestingData({ view });

    // Advance time - even if something async was started it should not reach send
    await vi.advanceTimersByTimeAsync(10_001);
    await Promise.resolve();

    expect(RunnerBridge.send).not.toHaveBeenCalled();
  });
});
