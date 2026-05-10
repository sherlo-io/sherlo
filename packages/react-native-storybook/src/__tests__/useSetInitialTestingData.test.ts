
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../storybook/adapter', () => ({
  getAdapter: vi.fn().mockReturnValue({
    enumerateStories: vi.fn().mockReturnValue([]),
  }),
}));

vi.mock('../getStorybook/components/TestingMode/useTestAllStories/prepareSnapshots', () => ({
  default: vi.fn().mockReturnValue([]),
}));

import useSetInitialTestingData from '../getStorybook/components/TestingMode/useTestAllStories/useSetInitialTestingData';
import { RunnerBridge } from '../helpers';
import SherloModule from '../SherloModule';
import { getAdapter } from '../storybook/adapter';
import prepareSnapshots from '../getStorybook/components/TestingMode/useTestAllStories/prepareSnapshots';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSetInitialTestingData', () => {
  it('enumerates via adapter, calls prepareSnapshots, and sends START', async () => {
    const fakeStoryMetas = [{ id: 'a--b', title: 'A', name: 'B', parameters: {} }];
    const fakeSnapshots = [{ viewId: 'a--b-deviceHeight' }];
    (getAdapter as any).mockReturnValue({
      enumerateStories: vi.fn().mockReturnValue(fakeStoryMetas),
    });
    (prepareSnapshots as any).mockReturnValue(fakeSnapshots);

    const view = {} as any;
    useSetInitialTestingData({ view });

    await Promise.resolve();
    await Promise.resolve();

    expect(prepareSnapshots).toHaveBeenCalledWith({
      storyMetas: fakeStoryMetas,
      splitByMode: true,
    });
    expect(RunnerBridge.send).toHaveBeenCalledWith({
      action: 'START',
      snapshots: fakeSnapshots,
    });
  });

  it('sends START with empty snapshots when adapter enumerates none', async () => {
    (getAdapter as any).mockReturnValue({
      enumerateStories: vi.fn().mockReturnValue([]),
    });
    (prepareSnapshots as any).mockReturnValue([]);

    const view = {} as any;
    useSetInitialTestingData({ view });

    await Promise.resolve();
    await Promise.resolve();

    expect(RunnerBridge.send).toHaveBeenCalledWith({
      action: 'START',
      snapshots: [],
    });
  });

  it('returns early and does NOT send START when lastState exists', async () => {
    (SherloModule.getLastState as ReturnType<typeof vi.fn>).mockReturnValue({
      requestId: 'abc',
      nextSnapshot: null,
    });

    const view = {} as any;
    useSetInitialTestingData({ view });

    await Promise.resolve();
    await Promise.resolve();

    expect(RunnerBridge.send).not.toHaveBeenCalled();
  });
});
