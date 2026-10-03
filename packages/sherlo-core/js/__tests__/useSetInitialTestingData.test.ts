/**
 * The sealed core's start of a test session (startTestSession, which the SDK's
 * useSetInitialTestingData hook calls). Its two steps - listing the stories and shaping them - are
 * stood in for, to see what it hands them and sends. Whether a capture's launch starts a session at
 * all is the hook's own question, tested in the SDK
 * (packages/react-native-storybook/src/__tests__/useSetInitialTestingData.test.ts).
 */
import type { SealedCoreHost } from '../../../react-native-storybook/src/sealedCore/seam';
import { installTestHost } from './testHost';
import { filterStoryMetas, startTestSession } from '../src/startTestSession';
import { enumerateStories } from '../src/adapter';
import prepareSnapshots from '../src/prepareSnapshots';

vi.mock('../src/adapter', () => ({ enumerateStories: vi.fn().mockReturnValue([]) }));
vi.mock('../src/prepareSnapshots', () => ({ default: vi.fn().mockReturnValue([]) }));

const send = vi.fn().mockResolvedValue({});
const getLastState = vi.fn();
const getConfig = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  getLastState.mockReturnValue(undefined);
  getConfig.mockReturnValue({ stabilization: {} });
  installTestHost({
    native: { getLastState, getConfig } as unknown as SealedCoreHost['native'],
    runner: { send, log: vi.fn() },
  });
});

describe('useSetInitialTestingData', () => {
  it('enumerates via adapter, calls prepareSnapshots, and sends START', async () => {
    const fakeStoryMetas = [{ id: 'a--b', title: 'A', name: 'B', parameters: {} }];
    const fakeSnapshots = [{ viewId: 'a--b-deviceHeight' }];
    (enumerateStories as any).mockReturnValue(fakeStoryMetas);
    (prepareSnapshots as any).mockReturnValue(fakeSnapshots);

    const view = {} as any;
    await startTestSession(view);

    expect(prepareSnapshots).toHaveBeenCalledWith({
      storyMetas: fakeStoryMetas,
      splitByMode: true,
    });
    expect(send).toHaveBeenCalledWith({
      action: 'START',
      snapshots: fakeSnapshots,
    });
  });

  it('sends START with empty snapshots when adapter enumerates none', async () => {
    (enumerateStories as any).mockReturnValue([]);
    (prepareSnapshots as any).mockReturnValue([]);

    const view = {} as any;
    await startTestSession(view);

    expect(send).toHaveBeenCalledWith({
      action: 'START',
      snapshots: [],
    });
  });

  it('returns early and does NOT send START when lastState exists', async () => {
    getLastState.mockReturnValue({
      requestId: 'abc',
      nextSnapshot: null,
    });

    const view = {} as any;
    await startTestSession(view);

    expect(send).not.toHaveBeenCalled();
  });

  it('applies discoveryFilter when config.discoveryFilter.includeStoryIds is set', async () => {
    getLastState.mockReturnValue(undefined);
    const allMetas = [
      { id: 'a--1', title: 'A', name: '1', parameters: {} },
      { id: 'b--2', title: 'B', name: '2', parameters: {} },
      { id: 'c--3', title: 'C', name: '3', parameters: {} },
    ];
    (enumerateStories as any).mockReturnValue(allMetas);
    getConfig.mockReturnValue({
      stabilization: {},
      discoveryFilter: { includeStoryIds: ['a--1', 'c--3'] },
    });
    (prepareSnapshots as any).mockReturnValue([
      { viewId: 'a--1-deviceHeight' },
      { viewId: 'c--3-deviceHeight' },
    ]);

    await startTestSession({} as any);

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
