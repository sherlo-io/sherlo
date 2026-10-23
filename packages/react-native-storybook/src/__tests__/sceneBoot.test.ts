// The early-boot module (src/sceneBoot.ts) as it runs in an app: the launch is read off the native
// module, the bundle's list of its scenes (src/bundledScenes.ts) is the one Sherlo's bundler
// writes, and the bundler's scan record (src/mocking/declaredImports.ts) names each mocked
// module's stand-in. That the module runs before the app's first one is
// bundle/earlyScene.test.ts's to show.

const launch = vi.hoisted(() => ({
  mode: 'testing',
  storyId: 'chat--conversation' as string | undefined,
  loadFile: vi.fn(),
}));

vi.mock('../SherloModule', () => ({
  default: {
    getMode: () => launch.mode,
    getLastState: () => ({ requestId: 'r', nextSnapshot: { storyId: launch.storyId } }),
    getConfigOrDefault: () => ({}),
  },
}));

vi.mock('../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

vi.mock('../bundledScenes', () => ({
  default: {
    'chat--conversation': {
      filePath: './src/chat.scenes.tsx',
      sceneName: 'Conversation',
      loadFile: () => launch.loadFile(),
    },
  },
}));

const SCENE_ID = 'chat--conversation';
const SWITCHED_ON_FLAG = '__sherloLaunchedSceneSwitchedOn';

// The app's stand-in for its module `src/api`, and the scene file that mocks it, written as the
// bundler's transform hands it over: the import as written rides as the third argument. Its import
// never settles, so only a mock installed with no import waited for can be in effect.
async function appWithAScene(): Promise<{ api: { whoAmI: () => string } }> {
  const { default: createMockable } = await import('../mocking/createMockable');
  const { mock } = await import('../mocking/mockDeclaration');
  const api = createMockable('src/api', { whoAmI: () => 'real' });
  const declare = mock as (...args: unknown[]) => unknown;
  launch.loadFile.mockReturnValue({
    default: {
      scenes: {
        Conversation: {
          mocks: [declare(() => new Promise(() => {}), { whoAmI: () => 'mocked' }, '../api')],
        },
      },
    },
  });
  return { api };
}

beforeEach(() => {
  vi.resetModules();
  launch.mode = 'testing';
  launch.storyId = SCENE_ID;
  launch.loadFile.mockReset();
  delete (globalThis as Record<string, unknown>)[SWITCHED_ON_FLAG];
  (globalThis as Record<string, unknown>).__sherloDeclaredImports = {
    storyFiles: { './src/chat.scenes.tsx': [{ specifier: '../api', moduleKey: 'src/api' }] },
    mockedModules: ['src/api'],
  };
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>)[SWITCHED_ON_FLAG];
  delete (globalThis as Record<string, unknown>).__sherloDeclaredImports;
});

describe('the early-boot module switches the launched scene on', () => {
  it("the launched scene's mocks are on once the early-boot module ran, with no import waited for", async () => {
    const { api } = await appWithAScene();
    await import('../sceneBoot');

    expect(launch.loadFile).toHaveBeenCalledTimes(1);
    expect(api.whoAmI()).toBe('mocked');
  });

  it('outside testing mode the early-boot module requires no scene file and mocks nothing', async () => {
    launch.mode = 'default';
    const { api } = await appWithAScene();
    await import('../sceneBoot');

    expect(launch.loadFile).not.toHaveBeenCalled();
    expect(api.whoAmI()).toBe('real');
  });

  it('a launch that names no scene of the bundle requires no scene file', async () => {
    launch.storyId = 'button--primary';
    await appWithAScene();
    await import('../sceneBoot');

    expect(launch.loadFile).not.toHaveBeenCalled();
  });

  it('a second copy of the SDK switches the launched scene on once', async () => {
    await appWithAScene();
    await import('../sceneBoot');
    vi.resetModules();
    await import('../sceneBoot');

    expect(launch.loadFile).toHaveBeenCalledTimes(1);
  });

  it('activating the scene again keeps the mocks it switched on at boot', async () => {
    const { api } = await appWithAScene();
    await import('../sceneBoot');
    const { activateMocksForStory } = await import('../getStorybook/storyMockActivation');
    activateMocksForStory(SCENE_ID);

    expect(api.whoAmI()).toBe('mocked');
  });
});
