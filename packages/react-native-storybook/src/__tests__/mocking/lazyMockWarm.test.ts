// A scene mocks a module the app first imports on a screen one of its steps opens: the chat's data
// store, which needs a native module the test build lacks. The scene's mock declaration imports the
// module lazily, so on a dev server it is a split bundle of its own that can land late, and when
// it lands Metro's import reads the module through its stand-in, which loads the real module. Run
// inside Metro's own module runtime, with the app's root as an error boundary that renders the app
// again from its first screen when a screen throws.

const { app } = vi.hoisted(() => ({
  app: { route: 'home', rootRenders: 0, events: [] as string[], readThread: () => {} },
}));

vi.mock('../../SherloModule', () => ({
  default: {
    getMode: () => 'testing',
    getConfigOrDefault: () => ({}),
    getViewVisibility: async (testIDs: string[]) => {
      const shown = renderTheApp();
      return Object.fromEntries(testIDs.map((id) => [id, id === shown ? 'visible' : 'absent']));
    },
  },
}));

vi.mock('../../helpers/RunnerBridge', () => ({ default: { log: vi.fn(), send: vi.fn() } }));

vi.mock('../../bundledScenes', () => ({
  default: {
    'chat--mocked': {
      filePath: './src/screens/Chat/Chat.scenes.tsx',
      sceneName: 'Mocked',
      loadFile: () => ({
        default: {
          scenes: {
            Mocked: {
              play: [
                { open: 'myapp://chat' },
                { ready: { testID: 'chat-thread', requestsIdle: false, timeoutMs: 2_000 } },
              ],
            },
          },
        },
      }),
    },
  },
}));

import * as fs from 'fs';
import { createLazyMockable } from '../../mocking/createMockable';
import { mock } from '../../mocking/mockDeclaration';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';
import { activateSceneMocks } from '../../getStorybook/storyMockActivation';
import { clearStoryError } from '../../getStorybook/storyErrorRegistry';
import { playSteps } from '../../playSteps';
import { __setOpenURL } from '../__mocks__/react-native';

const SCENE_ID = 'chat--mocked';
const SCENE_FILE = './src/screens/Chat/Chat.scenes.tsx';
const DATASOURCE = 'src/screens/Chat/store/chat.datasource';
const SHIM_ID = 0;
const DATASOURCE_ID = 1;
/** When the mock's split bundle lands if no step asked for the chat first: a cold bundler cache. */
const BUNDLE_LANDS_AFTER_MS = 5_000;

type MetroGlobal = typeof globalThis & {
  __r: ((moduleId: number) => Record<string, unknown>) & {
    importAll: (moduleId: number) => Record<string, unknown>;
  };
  __d: (factory: (...args: never[]) => void, moduleId: number, dependencyMap: number[]) => void;
  ErrorUtils?: { reportFatalError: (error: unknown) => void };
  __sherloDeclaredImports?: unknown;
};
const metro = globalThis as MetroGlobal;

const metroRuntimeSource = fs.readFileSync(
  require.resolve('metro-runtime/src/polyfills/require.js'),
  'utf8'
);

// The app's main bundle: the data store's stand-in, as metro/mockShims.js writes it, and the store.
function bundleWithTheChatStore(): void {
  metro.ErrorUtils = { reportFatalError: () => {} };
  // eslint-disable-next-line no-new-func
  new Function('global', '__DEV__', '__METRO_GLOBAL_PREFIX__', metroRuntimeSource)(
    metro,
    false,
    ''
  );
  metro.__d(
    (_global: unknown, require: (id: number) => unknown, ...rest: unknown[]) => {
      const [, , module, , dependencyMap] = rest as [
        unknown,
        unknown,
        { exports: unknown },
        unknown,
        number[],
      ];
      module.exports = createLazyMockable(DATASOURCE, () => require(dependencyMap[0]) as never);
    },
    SHIM_ID,
    [DATASOURCE_ID]
  );
  metro.__d(
    () => {
      throw new Error('chat store needs a native module');
    },
    DATASOURCE_ID,
    []
  );
}

/**
 * What the app shows now, by testID. The chat screen reads its thread from the store as it
 * renders; a throw there reaches the root's error boundary, which renders the app again from home.
 */
function renderTheApp(): string {
  if (app.route !== 'chat') return 'home';
  try {
    app.readThread();
    return 'chat-thread';
  } catch {
    app.rootRenders += 1;
    app.route = 'home';
    return 'home';
  }
}

afterEach(() => {
  clearMocks();
  clearStoryError(SCENE_ID);
  __resetShimmedKeysForTests();
  const bundleGlobals = ['__r', '__d', '__c', '__registerSegment', 'ErrorUtils'];
  [...bundleGlobals, '__sherloDeclaredImports'].forEach((name) => {
    delete (metro as unknown as Record<string, unknown>)[name];
  });
  vi.useRealTimers();
});

describe('a lazy mock bundle of a scene', () => {
  it("a scene's lazily mocked module first imported by a screen a step opens plays every step with no second root render", async () => {
    vi.useFakeTimers();
    bundleWithTheChatStore();
    app.rootRenders = 1;
    app.readThread = () => (metro.__r(SHIM_ID).loadThread as () => unknown)();
    metro.__sherloDeclaredImports = {
      storyFiles: {
        [SCENE_FILE]: [{ specifier: './store/chat.datasource', moduleKey: DATASOURCE }],
      },
      mockedModules: [DATASOURCE],
    };

    // The bundle lands once the chat is opened, or after a cold bundler's wait if nothing opens it.
    let land: () => void = () => {};
    const landed = new Promise<void>((resolve) => {
      land = () => {
        if (!app.events.includes('mock bundle landed')) app.events.push('mock bundle landed');
        resolve();
      };
    });
    setTimeout(land, BUNDLE_LANDS_AFTER_MS);
    __setOpenURL(async (url) => {
      app.events.push(`opened ${url}`);
      app.route = 'chat';
      land();
    });
    const storeMock = mock(
      () => landed.then(() => metro.__r.importAll(SHIM_ID)),
      { loadThread: () => ['the mocked thread'] },
      './store/chat.datasource'
    );

    activateSceneMocks(SCENE_ID, undefined, [storeMock], SCENE_FILE);
    const playing = playSteps(SCENE_ID).catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(await playing).toEqual(['open myapp://chat', 'ready']);
    expect(app.rootRenders).toBe(1);
    expect(app.events).toEqual(['mock bundle landed', 'opened myapp://chat']);
  });
});
