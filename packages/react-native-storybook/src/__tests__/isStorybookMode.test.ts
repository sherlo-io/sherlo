// src/isStorybookMode.ts: whether the app's root shows its own Storybook.
const launch = vi.hoisted(() => ({
  mode: 'testing',
  storyId: 'chat--conversation' as string | undefined,
  bundler: 'http://localhost:8081' as string | null,
}));

vi.mock('../SherloModule', () => ({
  default: {
    getMode: () => launch.mode,
    getLastState: () => ({ nextSnapshot: { storyId: launch.storyId } }),
  },
}));
vi.mock('../bundlerOrigin', () => ({ bundlerOrigin: () => launch.bundler }));
vi.mock('../bundledScenes', () => ({
  default: {
    'chat--conversation': { filePath: './a.scenes.tsx', sceneName: 'A', loadFile: () => {} },
  },
}));

async function isStorybookModeOfLaunch(): Promise<boolean> {
  vi.resetModules();
  return (await import('../isStorybookMode')).default;
}

beforeEach(() => {
  launch.mode = 'testing';
  launch.storyId = 'chat--conversation';
  launch.bundler = 'http://localhost:8081';
});

it("a capture launch that names one of the bundle's scenes is not Storybook mode, and a story launch still is", async () => {
  expect(await isStorybookModeOfLaunch()).toBe(false);

  launch.storyId = 'chat--a-story';
  expect(await isStorybookModeOfLaunch()).toBe(true);
});

it('the dev-menu Storybook mode and a default launch keep their answers', async () => {
  launch.mode = 'storybook';
  expect(await isStorybookModeOfLaunch()).toBe(true);

  launch.mode = 'default';
  expect(await isStorybookModeOfLaunch()).toBe(false);
});

it('a launch driven by a runner stays Storybook mode though its id is a scene id', async () => {
  launch.bundler = null;

  expect(await isStorybookModeOfLaunch()).toBe(true);
});
