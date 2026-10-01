/**
 * Loading the sealed core: what the SDK does with the core native code hands it, and what it does
 * with none.
 *
 * Native code is the react-native stub (./__mocks__/react-native): each test chooses what its
 * loadCore() answers, then imports the SDK fresh, because the core loads once per import.
 *
 * No renderer runs here, so React and the modules getStorybook.tsx draws with are stand-ins: the
 * JSX runtime answers `{ type, props }`, which is enough to see which component the entry renders.
 */
import {
  __getNativeErrors,
  __resetNativeMode,
  __resetSealedCoreNative,
  __setNativeLoadCore,
  __setNativeMode,
  __setNativeVersion,
  fakeSealedCoreSource,
  nativePickOf,
} from './__mocks__/react-native';
import { REQUIRED_MIN_NATIVE_VERSION } from '../sdk-compatibility.json';

vi.mock('react', () => ({
  default: { useEffect: () => {}, useRef: (initial: unknown) => ({ current: initial }) },
  useEffect: () => {},
  useRef: (initial: unknown) => ({ current: initial }),
}));
vi.mock('react/jsx-dev-runtime', () => ({
  jsxDEV: (type: unknown, props: unknown) => ({ type, props }),
  Fragment: Symbol('Fragment'),
}));
vi.mock('react/jsx-runtime', () => ({
  jsx: (type: unknown, props: unknown) => ({ type, props }),
  jsxs: (type: unknown, props: unknown) => ({ type, props }),
  Fragment: Symbol('Fragment'),
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('../getStorybook/components', () => ({ TestingMode: () => null }));
vi.mock('../getStorybook/hooks', () => ({ useHideSplashScreen: () => {} }));
vi.mock('../getStorybook/components/SherloStoryErrorBoundary', () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock('../storyOfTheApp', () => ({
  StoryOfTheApp: ({ children }: { children: unknown }) => children,
}));
/** The person's own Storybook, as getStorybookComponent hands it back. */
const { PersonsStorybook } = vi.hoisted(() => ({ PersonsStorybook: () => null }));
vi.mock('../getStorybook/helpers', () => ({ getStorybookComponent: () => PersonsStorybook }));

type CoreOnTheGlobal = { installedWith?: Record<string, unknown> } | undefined;

function coreOnTheGlobal(): CoreOnTheGlobal {
  return (globalThis as { __SHERLO_CORE__?: CoreOnTheGlobal }).__SHERLO_CORE__;
}

/** The SDK's loader, fresh: the next call loads again, asking native once more. */
async function freshLoader() {
  vi.resetModules();
  return import('../sealedCore/loadSealedCore');
}

async function freshCompatibilityCheck() {
  vi.resetModules();
  return (await import('../checkSdkCompatibility')).default;
}

/** What the SDK's Storybook entry renders in `mode`, from a fresh import. */
async function whatTheEntryRenders(mode: string): Promise<unknown> {
  __setNativeMode(mode);
  vi.resetModules();
  const getStorybook = (await import('../getStorybook/getStorybook')).default;
  const view = { _preview: {} } as never;
  const SherloStorybookEntry = getStorybook(view);
  return SherloStorybookEntry();
}

/** A Storybook channel that records listeners and lets a test emit to them. */
function makeChannel() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    on: (event: string, listener: (...args: unknown[]) => void) => {
      (listeners[event] ??= []).push(listener);
    },
    off: () => {},
    emit(event: string, ...args: unknown[]) {
      (listeners[event] ?? []).forEach((listener) => listener(...args));
    },
  };
}

/** Whether `sherlo capture` and `sherlo open` start: both ask their road once they do. */
async function sherloFeaturesStart(): Promise<boolean> {
  const { startCaptureTransport, stopCaptureTransport } = await import('../captureTransport');
  const { startOpenStoryChannel, stopOpenStoryChannel } = await import('../openStoryChannel');
  const waitForACapture = vi.fn(() => new Promise<never>(() => {}));
  const waitForStory = vi.fn(() => new Promise<never>(() => {}));
  const view = { _storyIndex: { entries: {} } } as never;

  startCaptureTransport({ view, channel: makeChannel() as never, capture: { waitForACapture } });
  startOpenStoryChannel({
    view,
    channel: makeChannel() as never,
    atTheStoryBrowser: true,
    letterbox: { waitForStory },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  stopCaptureTransport();
  stopOpenStoryChannel();

  return waitForACapture.mock.calls.length > 0 || waitForStory.mock.calls.length > 0;
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  __resetNativeMode();
  __resetSealedCoreNative();
  delete (globalThis as { __SHERLO_CORE__?: unknown }).__SHERLO_CORE__;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('loading the sealed core', () => {
  it('the SDK loads the JS core once, when it is imported, in every mode', async () => {
    for (const mode of ['default', 'storybook', 'testing']) {
      const loadCore = vi.fn(() => nativePickOf(fakeSealedCoreSource(1)));
      __setNativeLoadCore(loadCore);
      __setNativeMode(mode);
      vi.resetModules();

      await import('../index');
      expect(loadCore).toHaveBeenCalledTimes(1);

      const { getSealedCore } = await import('../sealedCore/loadSealedCore');
      expect(getSealedCore()).toBe(coreOnTheGlobal());
      getSealedCore();
      expect(loadCore).toHaveBeenCalledTimes(1);
    }
  });

  it('the JavaScript evaluates the core in global scope with indirect eval', async () => {
    const source = 'var sherloCoreScopeProbe = "global";\n' + fakeSealedCoreSource(1);
    __setNativeLoadCore(() => nativePickOf(source));

    (await freshLoader()).getSealedCore();

    // Only code evaluated in global scope leaves its `var` on the global object: a direct eval in
    // the SDK's strict module, or a Function body, would keep it to itself.
    expect((globalThis as { sherloCoreScopeProbe?: string }).sherloCoreScopeProbe).toBe('global');
    delete (globalThis as { sherloCoreScopeProbe?: string }).sherloCoreScopeProbe;
  });

  it('the SDK installs the core with the host it hands it', async () => {
    __setNativeLoadCore(() => nativePickOf(fakeSealedCoreSource(1)));
    const { getSealedCore } = await freshLoader();
    const core = getSealedCore();

    expect(core).not.toBeNull();
    const host = coreOnTheGlobal()?.installedWith;
    expect(host).toBeDefined();
    expect(Object.keys(host!).sort()).toEqual(
      [
        'activateMocksForStory',
        'bundlerOrigin',
        'clearMocks',
        'collectAppMetadata',
        'fetch',
        'mergeStoryMocks',
        'native',
        'providerFirstRenderedAt',
        'runner',
        'setCaptureLogSink',
        'storyErrors',
        'storybookChannelOf',
        'storyOfTheAppFiber',
        'warn',
      ].sort()
    );
    const SherloModule = (await import('../SherloModule')).default;
    expect(host!.native).toBe(SherloModule);
  });

  it('hands the core the fetch from before any mock wrapped it', async () => {
    const appsOwnFetch = vi.fn(async () => new Response('from the real network'));
    globalThis.fetch = appsOwnFetch as unknown as typeof fetch;
    __setNativeMode('storybook');
    __setNativeLoadCore(() => nativePickOf(fakeSealedCoreSource(1)));

    (await freshLoader()).getSealedCore();
    const host = coreOnTheGlobal()!.installedWith as { fetch: typeof fetch };

    // A story's network mock wraps the app's fetch...
    const { activateNetworkMocks } = await import('../mocking/network');
    activateNetworkMocks(
      {
        rules: [{ matcher: { url: 'https://example.com/orders' }, answer: { body: 'mocked' } }],
        passthrough: false,
      },
      () => {}
    );
    expect(globalThis.fetch).not.toBe(appsOwnFetch);
    expect(await (await globalThis.fetch('https://example.com/orders')).text()).toBe('mocked');

    // ...and the core's fetch still reaches the app's own.
    const answer = await host.fetch('https://example.com/orders');
    expect(await answer.text()).toBe('from the real network');
    expect(appsOwnFetch).toHaveBeenCalledTimes(1);

    const { clearNetworkMocks } = await import('../mocking/network');
    clearNetworkMocks();
  });

  it('a core whose seam this SDK does not speak is never installed', async () => {
    __setNativeLoadCore(() => nativePickOf(fakeSealedCoreSource(2)));

    const { getSealedCore } = await freshLoader();

    expect(getSealedCore()).toBeNull();
    expect(coreOnTheGlobal()?.installedWith).toBeUndefined();
  });

  it('a core whose seam this SDK does not speak fails the compatibility check in testing mode', async () => {
    __setNativeMode('testing');
    // A native version that clears the version gate, so only the seam can fail the check.
    __setNativeVersion(REQUIRED_MIN_NATIVE_VERSION);

    // The same native side with a core it speaks passes, so only the seam can fail it.
    expect((await freshCompatibilityCheck())()).toBe(true);
    expect(__getNativeErrors()).toEqual([]);

    __setNativeLoadCore(() => nativePickOf(fakeSealedCoreSource(2)));
    expect((await freshCompatibilityCheck())()).toBe(false);
    expect(__getNativeErrors()).toEqual([
      ['ERROR_SDK_COMPATIBILITY', expect.stringContaining('seam 2')],
    ]);
  });
});

describe('running with no core', () => {
  it("a native build with no core loader still renders Storybook, with Sherlo's features off", async () => {
    __setNativeLoadCore(null);

    expect(await whatTheEntryRenders('storybook')).toEqual({ type: PersonsStorybook, props: {} });
    expect((await import('../sealedCore/loadSealedCore')).getSealedCore()).toBeNull();
    expect(await sherloFeaturesStart()).toBe(false);
  });

  it('a native build with no core loader fails the compatibility check in testing mode', async () => {
    __setNativeMode('testing');
    // A native version that clears the version gate, so the missing loader is what fails the check.
    __setNativeVersion(REQUIRED_MIN_NATIVE_VERSION);
    __setNativeLoadCore(null);

    expect((await freshCompatibilityCheck())()).toBe(false);
    expect(__getNativeErrors()).toEqual([
      ['ERROR_SDK_COMPATIBILITY', expect.stringContaining('no core loader')],
    ]);
  });

  it("a core that throws while it evaluates still leaves Storybook rendering, with Sherlo's features off", async () => {
    __setNativeLoadCore(() => nativePickOf('throw new Error("the core broke");'));

    expect(await whatTheEntryRenders('storybook')).toEqual({ type: PersonsStorybook, props: {} });
    expect((await import('../sealedCore/loadSealedCore')).getSealedCore()).toBeNull();
    expect(await sherloFeaturesStart()).toBe(false);
  });

  it("with no core, a person's Storybook still turns on the mocks of the story they select", async () => {
    __setNativeMode('storybook');
    __setNativeLoadCore(null);
    vi.resetModules();

    const { getSealedCore } = await import('../sealedCore/loadSealedCore');
    const createMockable = (await import('../mocking/createMockable')).default;
    const { startInteractiveMockActivation, stopInteractiveMockActivation } = await import(
      '../getStorybook/interactiveMockActivation'
    );
    const { clearMocks } = await import('../mocking/registry');

    const storyFile = {
      default: { title: 'Mocking/Switch' },
      First: { parameters: { sherlo: { mocks: { 'pkg/switch': { label: 'first-mock' } } } } },
      Second: { parameters: { sherlo: { mocks: { 'pkg/switch': { label: 'second-mock' } } } } },
    };
    const req = Object.assign((_filename: string) => storyFile, {
      keys: () => ['./Switch.stories.tsx'],
    });
    (globalThis as { STORIES?: unknown }).STORIES = [{ directory: './src', req }];

    // Storybook's index holds the file's two stories; mocking finds each one through it.
    const firstStoryId = 'mocking-switch--first';
    const secondStoryId = 'mocking-switch--second';
    const importPath = './src/Switch.stories.tsx';
    const view = {
      _storyIndex: {
        entries: {
          [firstStoryId]: { id: firstStoryId, title: 'Mocking/Switch', name: 'First', importPath },
          [secondStoryId]: {
            id: secondStoryId,
            title: 'Mocking/Switch',
            name: 'Second',
            importPath,
          },
        },
      },
    } as never;
    const mockable = createMockable('pkg/switch', { label: 'real-switch' });
    const channel = makeChannel();

    expect(getSealedCore()).toBeNull();
    startInteractiveMockActivation(view, channel, firstStoryId);
    expect(mockable.label).toBe('first-mock');

    channel.emit('storyChanged', secondStoryId);
    expect(mockable.label).toBe('second-mock');

    stopInteractiveMockActivation();
    clearMocks();
    delete (globalThis as { STORIES?: unknown }).STORIES;
  });
});
