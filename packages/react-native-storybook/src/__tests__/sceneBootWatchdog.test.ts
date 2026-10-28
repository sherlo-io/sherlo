// The watchdogs and the runner's wait of an app of scenes and no Storybook (src/sceneBoot.ts): the
// JavaScript timer of metro/polyfill.js reads __sherloStorybookRendered, the native watchdogs hear
// notifyGetStorybookCalled, and the runner sends a scene once it hears STORYBOOK_LOADED. Only the
// Storybook road used to send any of them.
const launch = vi.hoisted(() => ({ storyId: undefined as string | undefined }));
const notify = vi.hoisted(() => vi.fn());
const sent = vi.hoisted(() => vi.fn());

vi.mock('../SherloModule', () => ({
  default: {
    getMode: () => 'testing',
    getLastState: () => ({ requestId: 'r', nextSnapshot: { storyId: launch.storyId } }),
    getConfigOrDefault: () => ({}),
    notifyGetStorybookCalled: notify,
  },
}));

vi.mock('../connection/appLine', () => ({ send: sent, logTheLine: () => {} }));

vi.mock('../bundledScenes', () => ({
  default: {
    'chat--conversation': { filePath: './a.scenes.tsx', sceneName: 'A', loadFile: () => undefined },
  },
}));

beforeEach(() => {
  vi.resetModules();
  notify.mockReset();
  sent.mockReset();
  launch.storyId = undefined;
  delete (globalThis as Record<string, unknown>).__sherloLaunchedSceneSwitchedOn;
  delete (globalThis as Record<string, unknown>).__sherloStorybookRendered;
  delete (globalThis as Record<string, unknown>).__SHERLO_CORE__;
});

async function bootAndSettle() {
  await import('../sceneBoot');
  await Promise.resolve();
  await Promise.resolve();
}

it('a scenes-only app that starts its session never reports that Storybook did not appear', async () => {
  await bootAndSettle();

  expect((globalThis as Record<string, unknown>).__sherloStorybookRendered).toBe(true);
  expect(notify).toHaveBeenCalledTimes(1);
});

it('a scenes-only app that starts its session tells the runner it takes scenes', async () => {
  await bootAndSettle();

  expect(sent.mock.calls.filter(([m]) => m.action === 'STORYBOOK_LOADED')).toHaveLength(1);
});

it('a scenes-only app launched on a scene tells the watchdogs and the runner too', async () => {
  launch.storyId = 'chat--conversation';
  await bootAndSettle();

  expect((globalThis as Record<string, unknown>).__sherloStorybookRendered).toBe(true);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(sent.mock.calls.filter(([m]) => m.action === 'STORYBOOK_LOADED')).toHaveLength(1);
});
