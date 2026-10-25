// A capture launch of an app with its own Storybook (src/sceneBoot.ts): Storybook has started and
// recorded its facts, but Sherlo's getStorybook never runs, so the scene boot is the one to ask the
// bundler's line for the capture (src/captureTransport.ts, startCaptureOfTheLaunch).
const launch = vi.hoisted(() => ({
  storyId: undefined as string | undefined,
  bundler: null as string | null,
  hasCore: true,
  // What the app's entry does; it runs synchronously right after the early-boot module's install,
  // before any microtask (the module's last step, activating the scene's mocks, stands for it).
  appEntry: undefined as (() => void) | undefined,
}));
const core = vi.hoisted(() => ({
  startTestSession: vi.fn(),
  startCaptureTransport: vi.fn(),
  // The collector's reading, as far as this test needs it: every view under the fibers it is given,
  // by its testID, with the props it was rendered with.
  mergeGenerations: vi.fn((roots: Array<Record<string, any>>) => {
    const viewProps: Record<string, unknown> = {};
    const visit = (fiber: Record<string, any> | null) => {
      for (let at = fiber; at; at = at.sibling) {
        if (typeof at.type === 'string' && at.memoizedProps?.testID) {
          viewProps[at.memoizedProps.testID] = at.memoizedProps;
        }
        visit(at.child);
      }
    };
    visit(roots[0].child);
    return { viewProps, texts: [], generations: [] };
  }),
}));

vi.mock('../SherloModule', () => ({
  default: {
    getMode: () => 'testing',
    getLastState: () => ({ requestId: 'r', nextSnapshot: { storyId: launch.storyId } }),
    getConfigOrDefault: () => ({}),
    notifyGetStorybookCalled: () => {},
  },
}));
vi.mock('../connection/appLine', () => ({
  send: vi.fn(),
  sendAndAwaitAnswer: vi.fn(),
  logTheLine: (what: string) =>
    console.log(`@sherlo/react-native-storybook: the bundler line ${what}`),
}));
vi.mock('../sealedCore/loadSealedCore', () => ({
  getSealedCore: () => (launch.hasCore ? core : null),
}));
vi.mock('../getStorybook/storyMockActivation', () => ({
  activateSceneMocks: () => launch.appEntry?.(),
}));
vi.mock('../bundlerOrigin', () => ({ bundlerOrigin: () => launch.bundler }));
vi.mock('react-native-safe-area-context', () => ({
  initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 } },
}));
vi.mock('../bundledScenes', () => ({
  default: {
    'chat--conversation': { filePath: './a.scenes.tsx', sceneName: 'A', loadFile: () => undefined },
  },
}));

import type React from 'react';

const channel = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
// How many captures the core is collecting for: its guard keeps a second start from adding one.
let collections = 0;

beforeEach(() => {
  vi.resetModules();
  core.startTestSession.mockClear();
  core.startCaptureTransport.mockReset();
  // The core's own guard: a second start while one is collecting does nothing (the seam says so).
  collections = 0;
  core.startCaptureTransport.mockImplementation(() => {
    if (collections === 0) collections = 1;
  });
  launch.storyId = 'chat--conversation';
  launch.bundler = 'http://localhost:8081';
  launch.hasCore = true;
  launch.appEntry = undefined;
  (globalThis as Record<string, unknown>).__STORYBOOK_ADDONS_CHANNEL__ = channel;
  delete (globalThis as Record<string, unknown>).__sherloLaunchedSceneSwitchedOn;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__STORYBOOK_ADDONS_CHANNEL__;
  vi.restoreAllMocks();
});

async function bootWithStorybookFacts() {
  const { recordStorybookFacts } = await import('../getStorybook/storybookFacts');
  recordStorybookFacts({ storyIndex: {}, storyFiles: {}, previewAnnotations: [] });
  await import('../sceneBoot');
  for (let turn = 0; turn < 6; turn++) await Promise.resolve();
}

it("a capture launch of an app whose Storybook is not Sherlo's asks the line for its capture", async () => {
  await bootWithStorybookFacts();

  expect(core.startCaptureTransport).toHaveBeenCalledTimes(1);
  expect(core.startCaptureTransport.mock.calls[0][0].channel).toBe(channel);
});

it('a capture launch whose Sherlo getStorybook runs too starts the capture transport once', async () => {
  await bootWithStorybookFacts();
  const { startCaptureTransport } = await import('../captureTransport');

  startCaptureTransport({ channel });

  expect(core.startCaptureTransport).toHaveBeenCalledTimes(2);
  expect(collections).toBe(1);
});

it('a capture launch that cannot start its transport says so in one log line', async () => {
  launch.hasCore = false;
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});

  await bootWithStorybookFacts();

  expect(log).toHaveBeenCalledTimes(1);
  expect(log.mock.calls[0][0]).toMatch(/^@sherlo\/react-native-storybook: the bundler line /);
});

it('a capture launch with no Storybook channel to listen on says so in one log line', async () => {
  delete (globalThis as Record<string, unknown>).__STORYBOOK_ADDONS_CHANNEL__;
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});

  await bootWithStorybookFacts();

  expect(core.startCaptureTransport).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledTimes(1);
  expect(log.mock.calls[0][0]).toContain('could not start waiting for a capture');
});

it('a launch with no scene or no bundler beside the app starts no capture transport', async () => {
  launch.bundler = null;
  await bootWithStorybookFacts();
  expect(core.startCaptureTransport).not.toHaveBeenCalled();
});

let theAppsRoot: React.ReactElement | undefined;

/** Render the app's root the way React Native does, inside the wrapper the launch installed. */
async function renderTheAppsRoot() {
  const { createElement } = await import('react');
  const { act, create } = await import('react-test-renderer');
  const { __getWrapperComponentProvider } = await import('./__mocks__/react-native');
  const Wrapper = __getWrapperComponentProvider()!() as React.ComponentType<{
    children: React.ReactNode;
  }>;
  let renderer: ReturnType<typeof create> | undefined;
  theAppsRoot = createElement(Wrapper, null, createElement('div', null, 'the app'));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  act(() => {
    renderer = create(theAppsRoot!);
  });
  return renderer!;
}

it('a capture launch of an app with its own Storybook shows the scene in a view that carries its id, inside the collector', async () => {
  await bootWithStorybookFacts();

  const renderer = await renderTheAppsRoot();

  expect(renderer.root.findByType('View' as never).props.testID).toBe('chat--conversation');
  const { collectAppMetadata } = await import('../appMetadata');
  const reading = collectAppMetadata();
  expect(Object.keys(reading!.viewProps)).toEqual(['chat--conversation']);
  expect(core.startCaptureTransport).toHaveBeenCalledTimes(1);
});

it("a capture launch of an app that sets its own wrapper provider after the boot uses the app's provider", async () => {
  const { createElement } = await import('react');
  const { AppRegistry } = await import('./__mocks__/react-native');
  const OwnWrapper = ({ children }: { children: React.ReactNode }) =>
    createElement('OwnWrapper', null, children);
  launch.appEntry = () => AppRegistry.setWrapperComponentProvider(() => OwnWrapper);
  await bootWithStorybookFacts();

  const renderer = await renderTheAppsRoot();

  expect(renderer.root.findAllByType('OwnWrapper' as never)).toHaveLength(1);
  expect(renderer.root.findAllByType('View' as never)).toHaveLength(0);
});

it('a capture launch wraps the scene once however often the root renders again', async () => {
  await bootWithStorybookFacts();
  const renderer = await renderTheAppsRoot();
  const { act } = await import('react-test-renderer');

  act(() => renderer.update(theAppsRoot!));

  expect(renderer.root.findAllByType('View' as never)).toHaveLength(1);
});

it('a launch of an app with its own Storybook that shows a story wraps nothing, whenever its getStorybook runs', async () => {
  launch.storyId = 'button--primary';
  await bootWithStorybookFacts();

  const renderer = await renderTheAppsRoot();

  expect(renderer.root.findAllByType('View' as never)).toHaveLength(0);
  const { collectAppMetadata } = await import('../appMetadata');
  expect(collectAppMetadata()).toBeUndefined();
  expect(core.startCaptureTransport).not.toHaveBeenCalled();
});
