// A cloud run's scenes-only app (src/sceneBoot.ts): the runner's story makes native keep the
// scene and reload the JavaScript, which then boots on that scene. No Storybook renders there, so
// the boot itself hands the scene to the sealed core, as the Storybook road does. That the mocks
// are cleared when the core throws is src/runnerWalk.ts's to show (runnerWalk.test.ts).
const launch = vi.hoisted(() => ({
  storyId: undefined as string | undefined,
  bundler: null as string | null,
}));
const order = vi.hoisted(() => [] as string[]);
const core = vi.hoisted(() => ({
  startTestSession: vi.fn(),
  testStory: vi.fn(async (_story: unknown) => {
    order.push('testStory');
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
vi.mock('../connection/appLine', () => ({ send: vi.fn() }));
vi.mock('../sealedCore/loadSealedCore', () => ({ getSealedCore: () => core }));
vi.mock('../bundlerOrigin', () => ({ bundlerOrigin: () => launch.bundler }));
vi.mock(import('../mocking'), async (importOriginal) => ({
  ...(await importOriginal()),
  clearMocks: () => {
    order.push('clearMocks');
  },
}));
vi.mock('react-native-safe-area-context', () => ({
  initialWindowMetrics: { insets: { top: 47, bottom: 34, left: 0, right: 0 } },
}));
vi.mock('../bundledScenes', () => ({
  default: {
    'chat--conversation': { filePath: './a.scenes.tsx', sceneName: 'A', loadFile: () => undefined },
  },
}));

beforeEach(() => {
  vi.resetModules();
  core.startTestSession.mockClear();
  core.testStory.mockClear();
  order.length = 0;
  launch.storyId = undefined;
  launch.bundler = null;
  delete (globalThis as Record<string, unknown>).__sherloLaunchedSceneSwitchedOn;
});

async function bootAndSettle() {
  await import('../sceneBoot');
  for (let turn = 0; turn < 6; turn++) await Promise.resolve();
}

it('a scenes-only app given a scene by the runner shows that scene and answers it', async () => {
  launch.storyId = 'chat--conversation';
  await bootAndSettle();

  expect(core.testStory).toHaveBeenCalledTimes(1);
  expect(core.startTestSession).not.toHaveBeenCalled();
});

it('a scenes-only app hands the scene the screen insets and the app metadata, then clears the mocks', async () => {
  launch.storyId = 'chat--conversation';
  await bootAndSettle();

  const story = core.testStory.mock.calls[0][0] as { insets: unknown; collectMetadata: unknown };
  expect(story.insets).toEqual({ top: 47, bottom: 34 });
  expect(typeof story.collectMetadata).toBe('function');
  expect(order).toEqual(['testStory', 'clearMocks']);
});

it('a scenes-only app launched from a bundler answers no runner', async () => {
  launch.storyId = 'chat--conversation';
  launch.bundler = 'http://localhost:8081';
  await bootAndSettle();

  expect(core.testStory).not.toHaveBeenCalled();
  expect(order).toEqual([]);
});

it('a scenes-only app given no scene starts its session and answers no scene', async () => {
  await bootAndSettle();

  expect(core.startTestSession).toHaveBeenCalledTimes(1);
  expect(core.testStory).not.toHaveBeenCalled();
});
