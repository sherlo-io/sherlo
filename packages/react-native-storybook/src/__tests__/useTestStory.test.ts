/**
 * What is left of useTestStory in the SDK: it hands the sealed core's walk of one story (testStory,
 * tested where the core is built) the view, the screen's insets and the app's metadata, runs it
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
const view = { _channel: undefined } as any;

beforeEach(() => {
  vi.clearAllMocks();
  testStory.mockResolvedValue(undefined);
});

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('useTestStory', () => {
  it('hands the core the view, the insets and a reading of the app metadata', async () => {
    useTestStory({ metadataProviderRef, view });
    await flushPromises();

    expect(testStory).toHaveBeenCalledTimes(1);
    const story = testStory.mock.calls[0][0];
    expect(story.view).toBe(view);
    expect(story.insets).toBe(INSETS);
    expect(story.collectMetadata()).toBe(METADATA);
  });

  it('does nothing when enabled is false, even with a story queued in lastState', async () => {
    // A capture's boot now carries a lastState just like a run's does (see SherloModuleCore on
    // each platform) - `enabled` (driven by SherloModule.getDriver() in useTestAllStories) is the
    // one thing standing between this and reporting to a runner that was never there to answer it.
    useTestStory({ metadataProviderRef, view, enabled: false });
    await flushPromises();

    expect(testStory).not.toHaveBeenCalled();
  });

  it("turns the story's mocks off once the core's walk is over", async () => {
    let finishTheWalk!: () => void;
    testStory.mockReturnValue(new Promise<void>((resolve) => (finishTheWalk = resolve)));

    useTestStory({ metadataProviderRef, view });
    await flushPromises();
    expect(mockClearMocks).not.toHaveBeenCalled();

    finishTheWalk();
    await flushPromises();
    expect(mockClearMocks).toHaveBeenCalledTimes(1);
  });
});
