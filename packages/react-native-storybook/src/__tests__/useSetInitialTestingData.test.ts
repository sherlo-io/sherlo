
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
    getConfig: vi.fn().mockReturnValue({ stabilization: {} }),
  },
}));

vi.mock('../storybook/adapter', () => ({
  enumerateStories: vi.fn().mockReturnValue([]),
}));

vi.mock('../getStorybook/components/TestingMode/useTestAllStories/prepareSnapshots', () => ({
  default: vi.fn().mockReturnValue([]),
}));

import useSetInitialTestingData, { filterStoryMetas } from '../getStorybook/components/TestingMode/useTestAllStories/useSetInitialTestingData';
import { RunnerBridge } from '../helpers';
import SherloModule from '../SherloModule';
import { enumerateStories } from '../storybook/adapter';
import prepareSnapshots from '../getStorybook/components/TestingMode/useTestAllStories/prepareSnapshots';

beforeEach(() => {
  vi.clearAllMocks();
  (SherloModule.getLastState as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
  (SherloModule.getConfig as ReturnType<typeof vi.fn>).mockReturnValue({ stabilization: {} });
});

describe('useSetInitialTestingData', () => {
  it('enumerates via adapter, calls prepareSnapshots, and sends START', async () => {
    const fakeStoryMetas = [{ id: 'a--b', title: 'A', name: 'B', parameters: {} }];
    const fakeSnapshots = [{ viewId: 'a--b-deviceHeight' }];
    (enumerateStories as any).mockReturnValue(fakeStoryMetas);
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
    (enumerateStories as any).mockReturnValue([]);
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

  it('applies discoveryFilter when config.discoveryFilter.includeStoryIds is set', async () => {
    (SherloModule.getLastState as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const allMetas = [
      { id: 'a--1', title: 'A', name: '1', parameters: {} },
      { id: 'b--2', title: 'B', name: '2', parameters: {} },
      { id: 'c--3', title: 'C', name: '3', parameters: {} },
    ];
    (enumerateStories as any).mockReturnValue(allMetas);
    (SherloModule.getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      stabilization: {},
      discoveryFilter: { includeStoryIds: ['a--1', 'c--3'] },
    });
    (prepareSnapshots as any).mockReturnValue([{ viewId: 'a--1-deviceHeight' }, { viewId: 'c--3-deviceHeight' }]);

    useSetInitialTestingData({ view: {} as any });
    await Promise.resolve();
    await Promise.resolve();

    expect(prepareSnapshots).toHaveBeenCalledWith({
      storyMetas: [allMetas[0], allMetas[2]],
      splitByMode: true,
    });
  });
});

describe('filterStoryMetas', () => {
  const metas = [
    { id: 'a--1', title: 'A', name: '1' },
    { id: 'b--2', title: 'B', name: '2' },
    { id: 'c--3', title: 'C', name: '3' },
  ];

  it('returns all metas when includeStoryIds is undefined', () => {
    expect(filterStoryMetas(metas, undefined)).toEqual(metas);
  });

  it('filters to only matching IDs', () => {
    expect(filterStoryMetas(metas, ['a--1', 'c--3'])).toEqual([metas[0], metas[2]]);
  });

  it('returns empty array when includeStoryIds is empty', () => {
    expect(filterStoryMetas(metas, [])).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const copy = [...metas];
    filterStoryMetas(metas, ['a--1']);
    expect(metas).toEqual(copy);
  });
});
