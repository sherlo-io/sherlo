// The early-boot module (src/sceneBoot.ts) as it runs in an app: the launch is read off the native
// module, the bundle's list of its scenes (src/bundledScenes.ts) is the one Sherlo's bundler
// writes, and the bundler's scan record (src/mocking/declaredImports.ts) names each mocked
// module's stand-in. That the module runs before the app's first one is
// bundle/earlyScene.test.ts's to show.
import * as http from 'http';
import type { AddressInfo } from 'net';

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

// The app's waits on the bundler's line, as they leave the app; none is ever answered here.
const sentOnTheLine = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock(import('../connection/appLine'), async (importOriginal) => ({
  ...(await importOriginal()),
  sendAndAwaitAnswer: ((message: Record<string, unknown>) => {
    sentOnTheLine.push(message);
    return new Promise(() => {});
  }) as never,
}));

// The app's JavaScript came from a bundler, so it waits on that bundler's line.
vi.mock(import('../bundlerOrigin'), async (importOriginal) => ({
  ...(await importOriginal()),
  bundlerOrigin: () => 'http://localhost:8081',
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

describe('the early-boot module starts the test session of an app with scenes and no Storybook', () => {
  type FakeCore = { calls: { method: string }[] };
  const sessionStarts = () =>
    (globalThis as { __SHERLO_CORE__?: FakeCore }).__SHERLO_CORE__?.calls.filter(
      (call) => call.method === 'startTestSession'
    ).length;

  beforeEach(() => {
    delete (globalThis as { __SHERLO_CORE__?: unknown }).__SHERLO_CORE__;
  });

  it('a story batch launch with scenes and no Storybook starts the core session once', async () => {
    launch.storyId = undefined;
    await import('../sceneBoot');
    await Promise.resolve();

    expect(sessionStarts()).toBe(1);
  });

  it('a story batch launch of an app that has Storybook leaves the session to its own road', async () => {
    launch.storyId = undefined;
    const { recordStorybookFacts } = await import('../getStorybook/storybookFacts');
    recordStorybookFacts({ storyIndex: {}, storyFiles: {}, previewAnnotations: [] });
    await import('../sceneBoot');
    await Promise.resolve();

    expect(sessionStarts() ?? 0).toBe(0);
  });
});

describe('a launch on a scene the bundle does not hold', () => {
  const { attach, LINE_PATH, PROTOCOL_VERSION } = require('../../metro/sherloLine.js');
  const ws = require('ws');
  const toClose: Array<() => void> = [];

  afterEach(() => {
    toClose.splice(0).forEach((close) => close());
    sentOnTheLine.splice(0);
  });

  /** The bundler's line on loopback, and the app's socket on it, past its hello. */
  async function theBundlersLine() {
    const server = http.createServer();
    const line = attach(server, ws.WebSocketServer || ws.Server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    toClose.push(() => server.close());
    const heard = new Promise<void>((resolve) =>
      line.onApp((app: { onMessage: (listener: (m: { action: string }) => void) => void }) =>
        app.onMessage((m) => m.action === 'waitForACapture' && resolve())
      )
    );
    const port = (server.address() as AddressInfo).port;
    const socket = new ws(`ws://127.0.0.1:${port}${LINE_PATH}`);
    toClose.push(() => socket.terminate());
    await new Promise((resolve) => socket.once('open', resolve));
    socket.send(
      JSON.stringify({
        action: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        nativeVersion: '3.0.0',
        jsVersion: '3.0.0',
      })
    );
    const instruction = new Promise<Record<string, unknown>>((resolve) =>
      socket.on('message', (data: unknown) => {
        const { action, ...rest } = JSON.parse(String(data));
        if (action === 'captureInstruction') resolve(rest);
      })
    );
    return { line, heard, instruction, send: (m: unknown) => socket.send(JSON.stringify(m)) };
  }

  it("a capture of a scene id missing from the bundle's list ends in an error, not in a picture of Home", async () => {
    launch.storyId = 'chat--menu-open';
    await appWithAScene();
    await import('../sceneBoot');
    const { bundlerCapture } = await import('../captureTransport');
    void bundlerCapture()?.waitForACapture({ mode: 'testing', stories: null, answer: null });

    const bundler = await theBundlersLine();
    bundler.send(sentOnTheLine[0]);
    await bundler.heard;
    const reply = bundler.line.ask({ action: 'captureStory', sceneId: 'chat--menu-open' });

    expect(launch.loadFile).not.toHaveBeenCalled();
    await expect(bundler.instruction).resolves.toEqual({});
    await expect(reply).resolves.toEqual({ kind: 'no-such-story', known: [SCENE_ID] });
  });
});
