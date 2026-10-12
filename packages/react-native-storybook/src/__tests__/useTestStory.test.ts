/**
 * What is left of useTestStory in the SDK: it hands the sealed core's walk of one story (testStory,
 * tested where the core is built) the screen's insets and the app's metadata, runs it
 * only for a launch a runner drives, and turns the story's mocks off when it is over. The core is
 * the suite's fake (./__mocks__/fakeSealedCore).
 */
const { mockClearMocks, INSETS } = vi.hoisted(() => ({
  mockClearMocks: vi.fn(),
  INSETS: { bottom: 34, top: 47, left: 0, right: 0 },
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (fn: () => void | (() => void)) => {
      fn();
    },
  };
});

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => INSETS,
}));

vi.mock('../mocking', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mocking')>()),
  clearMocks: mockClearMocks,
}));

import useTestStory from '../getStorybook/components/TestingMode/useTestAllStories/useTestStory';
import { getSealedCore } from '../sealedCore/loadSealedCore';

const testStory = vi.spyOn(getSealedCore()!, 'testStory');

const METADATA = { viewProps: {}, texts: ['components-button--primary'], generations: [] };
const metadataProviderRef = { current: { collectMetadata: () => METADATA } };

beforeEach(() => {
  vi.clearAllMocks();
  testStory.mockResolvedValue(undefined);
});

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('useTestStory', () => {
  it('hands the core the insets and a reading of the app metadata, and never the view', async () => {
    useTestStory({ metadataProviderRef });
    await flushPromises();

    expect(testStory).toHaveBeenCalledTimes(1);
    const story = testStory.mock.calls[0][0];
    expect(Object.keys(story).sort()).toEqual(['collectMetadata', 'insets']);
    expect(story.insets).toBe(INSETS);
    expect(story.collectMetadata()).toBe(METADATA);
  });

  it('does nothing when enabled is false, even with a story queued in lastState', async () => {
    // A capture's boot now carries a lastState just like a run's does (see SherloModuleCore on
    // each platform) - `enabled` (decided in useTestAllStories) is the one thing standing between
    // this and reporting to a runner that was never there to answer it.
    useTestStory({ metadataProviderRef, enabled: false });
    await flushPromises();

    expect(testStory).not.toHaveBeenCalled();
  });

  it('a story opened for a single capture keeps its mocks when the app mounts', async () => {
    useTestStory({ metadataProviderRef, enabled: false });
    await flushPromises();

    expect(mockClearMocks).not.toHaveBeenCalled();
  });

  it("turns the story's mocks off once the core's walk is over", async () => {
    let finishTheWalk!: () => void;
    testStory.mockReturnValue(new Promise<void>((resolve) => (finishTheWalk = resolve)));

    useTestStory({ metadataProviderRef });
    await flushPromises();
    expect(mockClearMocks).not.toHaveBeenCalled();

    finishTheWalk();
    await flushPromises();
    expect(mockClearMocks).toHaveBeenCalledTimes(1);
  });
});
