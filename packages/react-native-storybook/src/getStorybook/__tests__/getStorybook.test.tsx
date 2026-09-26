/**
 * getStorybook() is the app's entry factory - the synchronous function that runs at app boot,
 * before any component ever renders. A capture restarts the app into testing mode with nothing
 * ever written to the device (see ../../captureTransport.ts), so this is the first place "no
 * config on disk" has to survive: getStorybook() used to call SherloModule.getConfig() here
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
  mockGetStorybookChannel,
  mockStartStoryRenderedTracking,
} = vi.hoisted(() => ({
  mockGetMode: vi.fn(),
  mockGetConfig: vi.fn(),
  mockGetConfigOrDefault: vi.fn(),
  mockGetLastState: vi.fn(),
  mockNotifyGetStorybookCalled: vi.fn(),
  mockStartCaptureTransport: vi.fn(),
  mockGetStorybookChannel: vi.fn(),
  mockStartStoryRenderedTracking: vi.fn(),
}));

// This package only peer-depends on react (see package.json) and no test here renders a
// component tree, so 'react' itself, and the jsx-runtime esbuild's automatic JSX transform
// injects for getStorybook.tsx's JSX, need not resolve to anything real - only to something that
// does not throw on import.
vi.mock('react', () => ({
  default: { useEffect: () => {}, useRef: (initial: unknown) => ({ current: initial }) },
  useEffect: () => {},
  useRef: (initial: unknown) => ({ current: initial }),
}));
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
    // getConfig still throws when there is nothing on disk - the point of this test is that
    // getStorybook's testing-mode branch no longer calls it.
    getConfig: mockGetConfig,
    getConfigOrDefault: mockGetConfigOrDefault,
    getLastState: mockGetLastState,
    notifyGetStorybookCalled: mockNotifyGetStorybookCalled,
  },
}));

vi.mock('../../checkSdkCompatibility', () => ({
  default: () => true,
  __resetCacheForTests: () => {},
}));

vi.mock('../../captureTransport', () => ({
  startCaptureTransport: mockStartCaptureTransport,
}));

vi.mock('../components/TestingMode/useTestAllStories/storyRenderedReadiness', () => ({
  getStorybookChannel: mockGetStorybookChannel,
  startStoryRenderedTracking: mockStartStoryRenderedTracking,
}));

// The React tree itself is out of scope here (no renderer in this package's test setup) - these
// stand in for the modules getStorybook.tsx wires the returned entry component to.
vi.mock('../components', () => ({ TestingMode: () => null }));
vi.mock('../helpers', () => ({ getStorybookComponent: () => () => null }));
vi.mock('../hooks', () => ({ useHideSplashScreen: () => {} }));
vi.mock('../components/SherloStoryErrorBoundary', () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock('../interactiveMockActivation', () => ({
  startInteractiveMockActivation: vi.fn(),
  stopInteractiveMockActivation: vi.fn(),
}));
vi.mock('../../openStoryChannel', () => ({
  startOpenStoryChannel: vi.fn(),
  stopOpenStoryChannel: vi.fn(),
}));
vi.mock('../../storyOfTheApp', () => ({
  StoryOfTheApp: ({ children }: { children: unknown }) => children,
}));

import getStorybook, { __resetForTests } from '../getStorybook';

/**
 * What getConfigOrDefault answers when nothing was ever written to the device - the same shape
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

/** The app's Storybook view, as much of it as getStorybook.tsx's testing-mode branch reads. */
function makeView() {
  return {
    _channel: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    _preview: {
      getProjectAnnotations: async () => ({}),
      onGetProjectAnnotationsChanged: vi.fn(),
    },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetForTests();
  mockGetMode.mockReturnValue('testing');
  mockGetConfigOrDefault.mockReturnValue(CONFIG_WHEN_NOTHING_IS_ON_DISK);
  mockGetLastState.mockReturnValue(undefined);
  mockGetStorybookChannel.mockImplementation(
    (view: { _channel?: unknown }) => view?._channel ?? null
  );
  // Nothing was ever written to the device - the throw a capture's restarted app used to hit.
  mockGetConfig.mockImplementation(() => {
    throw new Error('Config is undefined');
  });
});

describe('testing mode with no config on disk still returns a storybook, and still answers a capture', () => {
  it('testing mode with no config on disk still returns a storybook, and still answers a capture', () => {
    const view = makeView();

    let entry: (() => unknown) | undefined;
    expect(() => {
      entry = getStorybook(view);
    }).not.toThrow();

    // Still returns a storybook: the entry point getStorybook always hands the app.
    expect(typeof entry).toBe('function');

    // getStorybook's testing-mode branch reads the app's config, and that read no longer throws.
    expect(mockGetConfigOrDefault).toHaveBeenCalled();
    expect(mockGetConfig).not.toHaveBeenCalled();

    // Still answers a capture: the transport that waits on the bundler's capture address started,
    // and did not get torn down under the config read that follows it.
    expect(mockStartCaptureTransport).toHaveBeenCalledTimes(1);
    expect(mockStartCaptureTransport).toHaveBeenCalledWith(expect.objectContaining({ view }));
  });
});
