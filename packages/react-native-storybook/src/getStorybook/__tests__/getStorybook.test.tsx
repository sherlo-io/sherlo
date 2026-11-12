/**
 * getStorybook() is the app's entry factory - the synchronous function that runs at app boot,
 * before any component ever renders. A capture restarts the app into testing mode with no runner
 * to hand it settings (see ../../captureTransport.ts), so this is the first place "no settings
 * from a runner" has to survive: getStorybook() used to call SherloModule.getConfig() here
 * unguarded, which threw and took the app down before a single story could be shown or a capture
 * answered.
 *
 * This exercises getStorybook() itself, the plain function - not the React tree it returns. This
 * package's tests never render a component tree (there is no react-test-renderer dependency
 * here), so every import getStorybook.tsx makes is replaced with a stub below; the one that
 * matters is ../../captureTransport's startCaptureTransport, spied on to prove the capture
 * listener is still wired up on the way out rather than torn down under the fix.
 */

const {
  mockGetMode,
  mockGetConfig,
  mockGetConfigOrDefault,
  mockGetLastState,
  mockNotifyGetStorybookCalled,
  mockStartCaptureTransport,
  mockBundlerCapture,
  effectsOfTheEntry,
} = vi.hoisted(() => ({
  mockGetMode: vi.fn(),
  mockGetConfig: vi.fn(),
  mockGetConfigOrDefault: vi.fn(),
  mockGetLastState: vi.fn(),
  mockNotifyGetStorybookCalled: vi.fn(),
  mockStartCaptureTransport: vi.fn(),
  mockBundlerCapture: vi.fn(),
  /** Every effect the entry component asked for, kept for a test to run, as React would. */
  effectsOfTheEntry: [] as (() => void | (() => void))[],
}));

// This package only peer-depends on react (see package.json) and no test here renders a
// component tree, so 'react' itself, and the jsx-runtime esbuild's automatic JSX transform
// injects for getStorybook.tsx's JSX, need not resolve to anything real - only to something that
// does not throw on import.
vi.mock('react', () => {
  const useEffect = (effect: () => void | (() => void)) => {
    effectsOfTheEntry.push(effect);
  };
  const useRef = (initial: unknown) => ({ current: initial });
  return { default: { useEffect, useRef }, useEffect, useRef };
});
vi.mock('react/jsx-dev-runtime', () => ({ jsxDEV: () => null, Fragment: Symbol('Fragment') }));
vi.mock('react/jsx-runtime', () => ({
  jsx: () => null,
  jsxs: () => null,
  Fragment: Symbol('Fragment'),
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock('../../SherloModule', () => ({
  default: {
    getMode: mockGetMode,
    // getConfig still throws when the runner handed no settings - the point of this test is that
    // getStorybook's testing-mode branch no longer calls it.
    getConfig: mockGetConfig,
    getConfigOrDefault: mockGetConfigOrDefault,
    getLastState: mockGetLastState,
    notifyGetStorybookCalled: mockNotifyGetStorybookCalled,
    awaitFrameCommit: async () => true,
  },
}));

vi.mock('../../checkSdkCompatibility', () => ({
  default: () => true,
  __resetCacheForTests: () => {},
}));

vi.mock('../../captureTransport', () => ({
  startCaptureTransport: mockStartCaptureTransport,
  bundlerCapture: mockBundlerCapture,
}));

// The React tree itself is out of scope here (no renderer in this package's test setup) - these
// stand in for the modules getStorybook.tsx wires the returned entry component to.
vi.mock('../components', () => ({ TestingMode: () => null }));
vi.mock('../helpers', () => ({ getStorybookComponent: () => () => null }));
vi.mock('../hooks', () => ({ useHideSplashScreen: () => {} }));
vi.mock('../components/SherloStoryErrorBoundary', () => ({
  default: ({ children }: { children: unknown }) => children,
}));
// The wait for Storybook to show a story stays real: a fresh start waits on it.
vi.mock('../../openStoryChannel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../openStoryChannel')>()),
  startOpenStoryChannel: vi.fn(),
  stopOpenStoryChannel: vi.fn(),
}));
vi.mock('../../storyOfTheApp', () => ({
  StoryOfTheApp: ({ children }: { children: unknown }) => children,
}));

import getStorybook, { __resetForTests } from '../getStorybook';
import { prepareStoryForRender } from '../sherloAnnotation';
import createMockable from '../../mocking/createMockable';
import { activateStoryMocks } from '../../mocking';

/**
 * What getConfigOrDefault answers when no runner handed any settings - the same shape
 * the SDK's own defaults take (DEFAULT_CONFIG in ../../SherloModule).
 */
const CONFIG_WHEN_NOTHING_IS_ON_DISK = {
  stabilization: {
    requiredMatches: 3,
    minScreenshotsCount: 3,
    intervalMs: 500,
    timeoutMs: 5000,
    threshold: 0.0,
    includeAA: true,
  },
};

/** The app's Storybook view, as much of it as getStorybook.tsx reads: its channel. */
function makeView() {
  return {
    _channel: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetForTests();
  effectsOfTheEntry.length = 0;
  mockGetMode.mockReturnValue('testing');
  mockGetConfigOrDefault.mockReturnValue(CONFIG_WHEN_NOTHING_IS_ON_DISK);
  mockGetLastState.mockReturnValue(undefined);
  // A bundler beside the app, whose relay hands no capture.
  mockBundlerCapture.mockReturnValue({ waitForACapture: async () => ({}) });
  // No runner handed any settings - the throw a capture's restarted app used to hit.
  mockGetConfig.mockImplementation(() => {
    throw new Error('Config is undefined');
  });
});

describe('testing mode with no settings from a runner still returns a storybook, and still answers a capture', () => {
  it('testing mode with no settings from a runner still returns a storybook, and still answers a capture', () => {
    const view = makeView();

    let entry: (() => unknown) | undefined;
    expect(() => {
      entry = getStorybook(view);
    }).not.toThrow();

    // Still returns a storybook: the entry point getStorybook always hands the app.
    expect(typeof entry).toBe('function');
    expect(mockGetConfig).not.toHaveBeenCalled();

    // Still answers a capture: the transport that waits on the bundler's capture address started,
    // and did not get torn down under the config read that follows it.
    expect(mockStartCaptureTransport).toHaveBeenCalledTimes(1);
    const storybooksChannel = (view as unknown as { _channel: unknown })._channel;
    // The road is the bundler's, wrapped so each story capture starts from a fresh app state.
    expect(mockStartCaptureTransport).toHaveBeenCalledWith({
      channel: storybooksChannel,
      capture: expect.objectContaining({ waitForACapture: expect.any(Function) }),
    });
  });

  it("the run's render delay is read through the config read that never throws", async () => {
    // The testing-mode config read moved from getStorybook into Sherlo's decorator, which holds
    // every story for its mocks: it reads the run's settings through getConfigOrDefault, never getConfig.
    await expect(prepareStoryForRender('components-button--primary')).resolves.toBeUndefined();

    expect(mockGetConfigOrDefault).toHaveBeenCalled();
    expect(mockGetConfig).not.toHaveBeenCalled();
  });
});

describe('leaving Storybook mode', () => {
  it('passes every module through to real again', () => {
    mockGetMode.mockReturnValue('storybook');
    const mockable = createMockable('pkg/left-behind', { label: 'real' });
    activateStoryMocks({ 'pkg/left-behind': { label: 'mocked' } });
    expect(mockable.label).toBe('mocked');

    const SherloStorybookEntry = getStorybook(makeView());
    SherloStorybookEntry();
    // React runs the entry's effects once it mounts, and their cleanups once it unmounts.
    const cleanups = effectsOfTheEntry.map((effect) => effect());
    cleanups.forEach((cleanup) => cleanup?.());

    expect(mockable.label).toBe('real');
  });
});

/** What a story draws as it mounts, before anything it does later changes it. */
type DrawnStory = { storyId: string; banner: string | null };

/**
 * A Storybook view and channel that draw a story the way React Native Storybook does: handing the
 * view a story mounts it from nothing, unless that story is mounted already, which keeps what it
 * drew since; `forceRemount` hands the view the story again, and says it rendered.
 */
function makeAStorybookThatKeepsItsStory() {
  const listeners = new Map<string, Set<() => void>>();
  let mounted: DrawnStory | null = null;
  let selected: string | null = null;

  function setStory(story: { id: string } | null): void {
    if (story === null) mounted = null;
    else if (mounted?.storyId !== story.id) mounted = { storyId: story.id, banner: null };
  }

  function renders(storyId: string): void {
    selected = storyId;
    setStory({ id: storyId });
    listeners.get('storyRendered')?.forEach((listener) => listener());
  }

  const channel = {
    on: (event: string, listener: () => void) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));
    },
    off: (event: string, listener: () => void) => {
      listeners.get(event)?.delete(listener);
    },
    emit: (event: string, { storyId }: { storyId: string }) => {
      if (event === 'setCurrentStory' || event === 'forceRemount') renders(storyId);
    },
  };

  return {
    view: {
      _channel: channel,
      _setStory: setStory,
      _preview: {
        get currentSelection() {
          return selected === null ? undefined : { storyId: selected };
        },
      },
    } as never,
    /** The core's walk: it asks Storybook for the story, and reads what is on screen. */
    walk(storyId: string): DrawnStory | null {
      channel.emit('setCurrentStory', { storyId });
      return mounted === null ? null : { ...mounted };
    },
    /** The story, still mounted after its capture, shows a banner of its own. */
    showsABanner(banner: string): void {
      if (mounted) mounted.banner = banner;
    },
  };
}

type Road = { waitForACapture: (saying: unknown) => Promise<{ storyId?: string }> };

/**
 * The road the core walks captures on, over a bundler that hands these instructions in turn: the
 * one getStorybook hands it, or the bundler's own when it hands none.
 */
function theRoadTheCoreIsHanded(instructions: Record<string, unknown>[]): () => Road {
  const bundlersRoad = { waitForACapture: vi.fn(async () => instructions.shift() ?? {}) };
  mockBundlerCapture.mockReturnValue(bundlersRoad);
  return () => {
    const started = mockStartCaptureTransport.mock.calls[0]?.[0] as { capture?: Road };
    return started.capture ?? bundlersRoad;
  };
}

describe('each story capture starts from a fresh app state', () => {
  const STORY = 'chat--list';
  const SAYING = { mode: 'testing', stories: [STORY], answer: null };

  it('an overlay a story left mounted is gone when the next capture opens its story', async () => {
    const storybook = makeAStorybookThatKeepsItsStory();
    const road = theRoadTheCoreIsHanded([
      { storyId: STORY, settings: {} },
      { storyId: STORY, settings: {}, startFresh: true },
    ]);
    getStorybook(storybook.view);

    const first = await road().waitForACapture(SAYING);
    expect(storybook.walk(first.storyId!)).toEqual({ storyId: STORY, banner: null });
    storybook.showsABanner('Refreshing...');

    const second = await road().waitForACapture(SAYING);
    expect(storybook.walk(second.storyId!)).toEqual({ storyId: STORY, banner: null });
  });

  it('a capture of the same story twice draws the same tree both times', async () => {
    const storybook = makeAStorybookThatKeepsItsStory();
    const road = theRoadTheCoreIsHanded([
      { storyId: STORY, settings: {} },
      { storyId: STORY, settings: {}, startFresh: true },
    ]);
    getStorybook(storybook.view);

    const firstTree = storybook.walk((await road().waitForACapture(SAYING)).storyId!);
    storybook.showsABanner('Refreshing...');
    const secondTree = storybook.walk((await road().waitForACapture(SAYING)).storyId!);

    expect(secondTree).toEqual(firstTree);
  });

  it('CONTROL: a story the line does not ask to start fresh keeps what it drew', async () => {
    const storybook = makeAStorybookThatKeepsItsStory();
    const road = theRoadTheCoreIsHanded([
      { storyId: STORY, settings: {} },
      { storyId: STORY, settings: {} },
    ]);
    getStorybook(storybook.view);

    storybook.walk((await road().waitForACapture(SAYING)).storyId!);
    storybook.showsABanner('Refreshing...');

    expect(storybook.walk((await road().waitForACapture(SAYING)).storyId!)).toEqual({
      storyId: STORY,
      banner: 'Refreshing...',
    });
  });
});
