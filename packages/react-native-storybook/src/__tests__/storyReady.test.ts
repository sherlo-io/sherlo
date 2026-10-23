/**
 * A story that boots a whole app says when it is ready to photograph: the views it names are on
 * screen and the screen is no longer waiting on a request. Only then does the screen's stillness
 * check start; a story never ready fails in one line that names what it waited for.
 */
const { mockGetMode, mockLog } = vi.hoisted(() => ({ mockGetMode: vi.fn(), mockLog: vi.fn() }));

vi.mock('../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

vi.mock('../helpers/RunnerBridge', () => ({
  default: { log: mockLog, send: vi.fn() },
}));

import { rememberAppMetadataCollector } from '../appMetadata';
import { activateMocksForStory } from '../getStorybook/storyMockActivation';
import {
  clearStoryError,
  readStoryError,
  recordStoryError,
} from '../getStorybook/storyErrorRegistry';
import { __resetStorybookFactsForTests } from '../getStorybook/storybookFacts';
import { mockRequest } from '../mocking/networkDeclaration';
import { clearMocks } from '../mocking/registry';
import { __resetRequestsInFlightForTests, requestsInFlight } from '../mocking/requestsInFlight';
import type { Metadata } from '../sealedCore/seam';
import { stabilizeOnceReady } from '../storyReady';
import { startStorybookHolding } from './mocking/storybookHolding';

const SCENE_ID = 'scenes-discover--signed-in';
const PLAIN_ID = 'components-button--primary';
const BASE = 'https://ready.sherlo.invalid';

/** The app's views as the renderer would publish them: one view per testID, current generation. */
function screenWith(testIDs: string[]): Metadata {
  const viewProps = Object.fromEntries(testIDs.map((testID, index) => [index + 1, { testID }]));
  return { viewProps, texts: [], generations: [{ viewProps, texts: [] }] };
}

let onScreen: string[] = [];

/** A real-network fetch whose answer the test releases when it chooses. */
let releaseNetwork: () => void = () => {};
const realFetch = globalThis.fetch;
const slowNetwork = vi.fn(
  () =>
    new Promise<Response>((resolve) => {
      releaseNetwork = () => resolve(new Response('{}'));
    })
);

/** The native stillness check, recording when it was asked. */
const nativeStabilize = vi.fn(async () => true);
const native = {
  getMode: () => 'testing' as const,
  stabilize: nativeStabilize,
};

function stabilize(): Promise<boolean> {
  return stabilizeOnceReady(native).stabilize(3, 6, 500, 20_000, false, 0.02, true);
}

function holdStories(sceneReady: unknown): void {
  startStorybookHolding([
    {
      importPath: './src/Scene.stories.tsx',
      fileExports: {
        default: {
          title: 'scenes/Discover',
          parameters: {
            sherlo: { ready: sceneReady, mocks: [mockRequest.passthrough()] },
          },
        },
        SignedIn: {},
      },
      stories: [{ id: SCENE_ID, name: 'Signed In' }],
    },
    {
      importPath: './src/Button.stories.tsx',
      fileExports: { default: { title: 'components/Button' }, Primary: {} },
      stories: [{ id: PLAIN_ID, name: 'Primary' }],
    },
  ]);
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetMode.mockReturnValue('testing');
  globalThis.fetch = slowNetwork as unknown as typeof fetch;
  onScreen = [];
  rememberAppMetadataCollector(() => screenWith(onScreen));
  nativeStabilize.mockClear();
  mockLog.mockClear();
  __resetRequestsInFlightForTests();
});

afterEach(() => {
  clearMocks();
  rememberAppMetadataCollector(undefined);
  __resetStorybookFactsForTests();
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});

describe('a story that names what must be on screen', () => {
  it('starts the stillness check only once the named view is on screen', async () => {
    holdStories({ testID: 'discover.card' });
    activateMocksForStory(SCENE_ID);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(nativeStabilize).not.toHaveBeenCalled();

    onScreen = ['discover.card'];
    await vi.advanceTimersByTimeAsync(1_000);

    expect(await settled).toBe(true);
    expect(nativeStabilize).toHaveBeenCalledTimes(1);
    expect(nativeStabilize).toHaveBeenCalledWith(3, 6, 500, 20_000, false, 0.02, true);
  });

  it('waits for every view a list of testIDs names', async () => {
    holdStories({ testID: ['discover.card', 'discover.filter.undo.button'] });
    activateMocksForStory(SCENE_ID);
    onScreen = ['discover.card'];

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(nativeStabilize).not.toHaveBeenCalled();

    onScreen = ['discover.card', 'discover.filter.undo.button'];
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await settled).toBe(true);
  });

  it('fails in one line naming the view when it never shows', async () => {
    holdStories({ testID: 'discover.card', timeoutMs: 5_000 });
    activateMocksForStory(SCENE_ID);
    onScreen = ['discover.implementation-pending'];

    const settled = stabilize();
    const failure = expect(settled).rejects.toThrow(
      `Story ${SCENE_ID} was not ready after 5 s: no view on screen has testID "discover.card".`
    );
    await vi.advanceTimersByTimeAsync(6_000);
    await failure;
    expect(nativeStabilize).not.toHaveBeenCalled();
  });

  it('reads only the views on screen now, not a generation the renderer left behind', async () => {
    holdStories({ testID: 'discover.card', timeoutMs: 2_000 });
    activateMocksForStory(SCENE_ID);
    rememberAppMetadataCollector(() => ({
      viewProps: { 1: { testID: 'discover.card' } },
      texts: [],
      generations: [
        { viewProps: { 2: { testID: 'discover.implementation-pending' } }, texts: [] },
        { viewProps: { 1: { testID: 'discover.card' } }, texts: [] },
      ],
    }));

    const settled = stabilize();
    const failure = expect(settled).rejects.toThrow('no view on screen has testID "discover.card"');
    await vi.advanceTimersByTimeAsync(3_000);
    await failure;
  });

  it('logs how long the story took to be ready', async () => {
    holdStories({ testID: 'discover.card' });
    activateMocksForStory(SCENE_ID);
    onScreen = ['discover.card'];

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
    expect(mockLog).toHaveBeenCalledWith('story ready', { storyId: SCENE_ID, waitedMs: 500 });
  });

  it('checks again for each new activation, and once for the parts of a tall story', async () => {
    holdStories({ testID: 'discover.card' });
    activateMocksForStory(SCENE_ID);
    onScreen = ['discover.card'];

    const first = stabilize();
    await vi.advanceTimersByTimeAsync(1_000);
    await first;

    // A tall story's later part: already proven ready, so straight to the stillness check.
    onScreen = [];
    expect(await stabilize()).toBe(true);
    expect(nativeStabilize).toHaveBeenCalledTimes(2);

    // The same story captured again starts from nothing.
    activateMocksForStory(SCENE_ID);
    const again = stabilize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(nativeStabilize).toHaveBeenCalledTimes(2);
    onScreen = ['discover.card'];
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await again).toBe(true);
  });
});

describe('a story that is ready only once its requests are done', () => {
  it('waits for a request let through to the real network to come back', async () => {
    holdStories({ testID: 'discover.card' });
    activateMocksForStory(SCENE_ID);
    onScreen = ['discover.card'];

    const answer = globalThis.fetch(`${BASE}/graphql`, { method: 'POST', body: '{}' });
    await vi.advanceTimersByTimeAsync(0);
    expect(requestsInFlight()).toEqual([{ method: 'POST', url: `${BASE}/graphql` }]);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(nativeStabilize).not.toHaveBeenCalled();

    releaseNetwork();
    await answer;
    expect(requestsInFlight()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await settled).toBe(true);
  });

  it('counts an XMLHttpRequest let through until its loadend', async () => {
    class ListeningXhr {
      listeners: Record<string, (() => void)[]> = {};
      open(): void {}
      send(): void {}
      getResponseHeader(): null {
        return null;
      }
      getAllResponseHeaders(): string {
        return '';
      }
      addEventListener(type: string, listener: () => void): void {
        (this.listeners[type] ??= []).push(listener);
      }
    }
    const globals = globalThis as unknown as { XMLHttpRequest: unknown };
    const realXhr = globals.XMLHttpRequest;
    globals.XMLHttpRequest = ListeningXhr;
    try {
      holdStories({ testID: 'discover.card' });
      activateMocksForStory(SCENE_ID);

      const Xhr = globals.XMLHttpRequest as new () => ListeningXhr & {
        open(method: string, url: string): void;
      };
      const xhr = new Xhr();
      xhr.open('GET', `${BASE}/feed`);
      xhr.send();
      expect(requestsInFlight()).toEqual([{ method: 'GET', url: `${BASE}/feed` }]);

      xhr.listeners.loadend.forEach((listener) => listener());
      expect(requestsInFlight()).toEqual([]);
    } finally {
      clearMocks();
      globals.XMLHttpRequest = realXhr;
    }
  });

  it('names the requests still in flight when it gives up', async () => {
    holdStories({ testID: 'discover.card', timeoutMs: 3_000 });
    activateMocksForStory(SCENE_ID);
    onScreen = ['discover.card'];

    void globalThis.fetch(`${BASE}/graphql`, { method: 'POST', body: '{}' });
    const settled = stabilize();
    const failure = expect(settled).rejects.toThrow(
      `Story ${SCENE_ID} was not ready after 3 s: 1 request still in flight: POST ${BASE}/graphql.`
    );
    await vi.advanceTimersByTimeAsync(4_000);
    await failure;
  });

  it('can be told to ignore requests', async () => {
    holdStories({ testID: 'discover.card', requestsIdle: false });
    activateMocksForStory(SCENE_ID);
    onScreen = ['discover.card'];

    void globalThis.fetch(`${BASE}/graphql`, { method: 'POST', body: '{}' });
    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await settled).toBe(true);
  });

  it('counts a request a rule answers after a delay until it is answered', async () => {
    startStorybookHolding([
      {
        importPath: './src/Delayed.stories.tsx',
        fileExports: {
          default: { title: 'scenes/Delayed' },
          Slow: {
            parameters: {
              sherlo: {
                ready: { testID: 'discover.card' },
                mocks: [mockRequest({ url: `${BASE}/me` }, { body: { ok: true }, delayMs: 2_000 })],
              },
            },
          },
        },
        stories: [{ id: 'scenes-delayed--slow', name: 'Slow' }],
      },
    ]);
    activateMocksForStory('scenes-delayed--slow');
    onScreen = ['discover.card'];

    const answer = globalThis.fetch(`${BASE}/me`);
    await vi.advanceTimersByTimeAsync(0);
    expect(requestsInFlight()).toEqual([{ method: 'GET', url: `${BASE}/me` }]);
    await vi.advanceTimersByTimeAsync(2_000);
    await answer;
    expect(requestsInFlight()).toEqual([]);
  });
});

describe('a story that names what must be on screen and throws', () => {
  const thrown = {
    name: 'TypeError',
    message: "Cannot read property 'allowPWM' of undefined",
    stack: '',
    componentStack: '',
  };

  afterEach(() => clearStoryError(SCENE_ID));

  it('reports the throw at once, not the ready timeout', async () => {
    holdStories({ testID: 'discover.card' });
    activateMocksForStory(SCENE_ID);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(nativeStabilize).not.toHaveBeenCalled();

    // What the error boundary does when the story throws while rendering.
    recordStoryError(SCENE_ID, thrown);
    await vi.advanceTimersByTimeAsync(100);

    // No "was not ready after 30 s": the check goes on and the story's own error is read, as for
    // a story with no `ready`.
    expect(await settled).toBe(true);
    expect(readStoryError(SCENE_ID)).toEqual(thrown);
  });

  it('does not wait at all for a story that had already thrown', async () => {
    holdStories({ testID: 'discover.card' });
    activateMocksForStory(SCENE_ID);
    recordStoryError(SCENE_ID, thrown);

    expect(await stabilize()).toBe(true);
  });
});

describe('a story that names nothing', () => {
  it('goes straight to the stillness check, as every story always has', async () => {
    holdStories({ testID: 'discover.card' });
    activateMocksForStory(PLAIN_ID);

    expect(await stabilize()).toBe(true);
    expect(nativeStabilize).toHaveBeenCalledTimes(1);
  });

  it('leaves every other native call as it is', () => {
    const wrapped = stabilizeOnceReady(native);
    expect(wrapped.getMode).toBe(native.getMode);
  });
});
