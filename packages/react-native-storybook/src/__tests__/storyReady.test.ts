// A scene says when it is ready to photograph: the views it names are drawn (or gone) in the native
// view tree and the screen is no longer waiting on a request. Only then does the screen's
// stillness check start; a scene never ready fails in one line that names what it waited for.
// Everything is judged by the native view tree, asked by testID, because a scene loads no Storybook.

const { mockGetMode, visibility, readVisibility, scene } = vi.hoisted(() => {
  const states: { now: Record<string, string>; unreadable: boolean } = {
    now: {},
    unreadable: false,
  };
  return {
    mockGetMode: vi.fn(),
    visibility: states,
    readVisibility: vi.fn(async (testIDs: string[]) => {
      if (states.unreadable) throw new Error('no view tree');
      return Object.fromEntries(testIDs.map((id) => [id, states.now[id] ?? 'absent']));
    }),
    scene: { ready: undefined as unknown },
  };
});

vi.mock('../SherloModule', () => ({
  default: {
    getMode: mockGetMode,
    getConfigOrDefault: () => ({}),
    getViewVisibility: readVisibility,
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
      loadFile: () => ({ default: { scenes: { Conversation: { ready: scene.ready } } } }),
    },
  },
}));

import {
  clearStoryError,
  readStoryError,
  recordStoryError,
} from '../getStorybook/storyErrorRegistry';
import { activateSceneMocks } from '../getStorybook/storyMockActivation';
import createMockable from '../mocking/createMockable';
import { __resetRequestsInFlightForTests, requestStarted } from '../mocking/requestsInFlight';
import { clearMocks, __resetShimmedKeysForTests } from '../mocking/registry';
import { awaitReady, proveReadyAgain, stabilizeOnceReady, storyAboutToRender } from '../storyReady';

const SCENE_ID = 'chat--conversation';
const SCENE_FILE = './src/chat.scenes.tsx';
const SETTINGS = [3, 6, 500, 20_000, false, 0.02, true] as const;

/** The native stillness check, recording when it was asked. */
const nativeStabilize = vi.fn(async () => true);

function stabilize(): Promise<boolean> {
  const native = { stabilize: nativeStabilize, getViewVisibility: readVisibility };
  return stabilizeOnceReady(native).stabilize(...SETTINGS);
}

function thrownByTheApp(name: string, message: string) {
  return { name, message, stack: '', componentStack: '' };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetMode.mockReturnValue('testing');
  visibility.now = {};
  visibility.unreadable = false;
  scene.ready = undefined;
  nativeStabilize.mockClear();
  readVisibility.mockClear();
  __resetRequestsInFlightForTests();
  storyAboutToRender(SCENE_ID);
});

afterEach(() => {
  clearMocks();
  clearStoryError(SCENE_ID);
  delete (globalThis as { __sherloDeclaredImports?: unknown }).__sherloDeclaredImports;
  __resetShimmedKeysForTests();
  vi.useRealTimers();
});

describe('a scene says when it is ready', () => {
  it('starts the stillness check only once the named view is on screen', async () => {
    scene.ready = 'chat.list';
    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(nativeStabilize).not.toHaveBeenCalled();

    visibility.now = { 'chat.list': 'visible' };
    await vi.advanceTimersByTimeAsync(1_000);

    expect(await settled).toBe(true);
    expect(nativeStabilize).toHaveBeenCalledTimes(1);
    expect(nativeStabilize).toHaveBeenCalledWith(...SETTINGS);
  });

  it('a view named in gone must be absent before the scene is ready', async () => {
    scene.ready = { gone: 'splash', requestsIdle: false };
    visibility.now = { splash: 'visible' };
    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(nativeStabilize).not.toHaveBeenCalled();

    // Still mounted but faded out counts as gone, just as a view no longer in the tree does.
    visibility.now = { splash: 'invisible' };
    await vi.advanceTimersByTimeAsync(200);
    expect(await settled).toBe(true);
    expect(nativeStabilize).toHaveBeenCalledTimes(1);
  });

  it('an error thrown while waiting beats the ready failure', async () => {
    scene.ready = { testID: 'chat.list', timeoutMs: 1_000 };
    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(300);

    recordStoryError(SCENE_ID, thrownByTheApp('TypeError', 'boom'));
    await vi.advanceTimersByTimeAsync(300);

    // The wait ended at once and the stillness check ran, so the capture reports the app's error.
    expect(await settled).toBe(true);
    expect(readStoryError(SCENE_ID)?.message).toBe('boom');
  });

  it('a mock failure is judged only after the scene settled', async () => {
    (globalThis as { __sherloDeclaredImports?: unknown }).__sherloDeclaredImports = {
      storyFiles: { [SCENE_FILE]: [{ specifier: '../own', moduleKey: 'own' }] },
      mockedModules: ['own'],
    };
    createMockable('own', { label: 'real' });
    activateSceneMocks(SCENE_ID, {}, { own: { label: 'scene' } }, SCENE_FILE);

    // The app imports its mocked modules as it renders, after the first look at the scene.
    scene.ready = { testID: 'chat.list', timeoutMs: 1_000, requestsIdle: false };
    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(500);
    expect(readStoryError(SCENE_ID)).toBeUndefined();
    expect(nativeStabilize).not.toHaveBeenCalled();

    visibility.now = { 'chat.list': 'visible' };
    await vi.advanceTimersByTimeAsync(200);
    await settled;

    expect(readStoryError(SCENE_ID)?.message).toContain('nothing in the story imported it');
  });

  it('ready is proved again before every capture', async () => {
    scene.ready = { testID: 'chat.list', requestsIdle: false };
    visibility.now = { 'chat.list': 'visible' };
    await stabilize();
    await stabilize();
    // One proof covers the parts of one capture.
    expect(readVisibility).toHaveBeenCalledTimes(1);

    proveReadyAgain();
    visibility.now = {};
    const nextCapture = stabilize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(nativeStabilize).toHaveBeenCalledTimes(2);

    visibility.now = { 'chat.list': 'visible' };
    await vi.advanceTimersByTimeAsync(200);
    await nextCapture;
    expect(nativeStabilize).toHaveBeenCalledTimes(3);
  });
});

describe('a scene that never gets ready', () => {
  it('fails in one line that names a view past the depth limit as read gone', async () => {
    scene.ready = { testID: 'chat.list', gone: 'splash', timeoutMs: 1_000, requestsIdle: false };
    visibility.now = { splash: 'unreached' };
    const failure = stabilize().catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(1_200);

    expect(await failure).toBe(
      'Story chat--conversation was not ready after 1 s: no view on screen has testID "chat.list"; ' +
        `view "splash" is past the inspector's depth limit and was read as gone.`
    );
    expect(nativeStabilize).not.toHaveBeenCalled();
  });

  it('names the requests still in flight when it gives up', async () => {
    scene.ready = { testID: 'chat.list', timeoutMs: 1_000 };
    visibility.now = { 'chat.list': 'visible' };
    requestStarted({ method: 'GET', url: 'https://api.example/chats' });
    const failure = stabilize().catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(1_200);

    expect(await failure).toContain('1 request still in flight: GET https://api.example/chats');
  });

  it('says so when the native view tree cannot be read', async () => {
    visibility.unreadable = true;
    const outcome = awaitReady({ testID: 'chat.list', timeoutMs: 300, requestsIdle: false });
    await vi.advanceTimersByTimeAsync(500);

    expect(await outcome).toMatchObject({
      outcome: 'timed-out',
      route: [],
      line: expect.stringContaining('the native view tree could not be read'),
    });
  });
});

describe('a scene file that waits for a view itself', () => {
  it('answers shown for a view on screen and gone for a view that left', async () => {
    visibility.now = { 'chat.list': 'visible' };
    const shown = awaitReady({ testID: 'chat.list', requestsIdle: false });
    await vi.advanceTimersByTimeAsync(100);
    expect(await shown).toEqual({ outcome: 'shown' });

    const gone = awaitReady({ gone: 'splash', requestsIdle: false });
    await vi.advanceTimersByTimeAsync(100);
    expect(await gone).toEqual({ outcome: 'gone' });
  });

  it('throws what the app threw instead of timing out', async () => {
    const waiting = awaitReady('chat.list').catch((error: Error) => error);
    recordStoryError(SCENE_ID, thrownByTheApp('RangeError', 'bad'));
    await vi.advanceTimersByTimeAsync(200);

    expect(await waiting).toMatchObject({ name: 'RangeError', message: 'bad' });
  });
});

describe('a scene that names nothing', () => {
  it('goes straight to the stillness check', async () => {
    await stabilize();

    expect(readVisibility).not.toHaveBeenCalled();
    expect(nativeStabilize).toHaveBeenCalledTimes(1);
  });
});
