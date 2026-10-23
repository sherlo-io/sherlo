/**
 * A story with network mocks holds every WebSocket its screen opens: a socket rule answers it
 * ('pending' or 'refuse'), and one no rule matches is refused and listed like an unmatched
 * request. No socket in such a story reaches the network, so a scene whose app opens a
 * subscription socket on boot (Apollo's GraphQLWsLink over graphql-ws) settles the same way on
 * every boot.
 *
 * "The network" here is a stand-in WebSocket class that counts every socket built through it.
 */
import { createClient } from 'graphql-ws';

const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import { NativeModules } from 'react-native';
import { activateMocksForStory } from '../../getStorybook/storyMockActivation';
import { clearStoryError, readStoryError } from '../../getStorybook/storyErrorRegistry';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { mockRequest } from '../../mocking/networkDeclaration';
import { __releaseWebSocketsForTests, holdWebSockets } from '../../mocking/network';
import { unansweredRequests } from '../../mocking/networkRules';
import { SOCKET_REFUSED_CODE } from '../../mocking/networkSocket';
import { clearMocks } from '../../mocking/registry';
import { requestsInFlight } from '../../mocking/requestsInFlight';
import type { StoryMocks } from '../../mocking/mockDeclaration';
import { startStorybookHolding } from './storybookHolding';

const SUBSCRIPTIONS = 'wss://subscriptions.sherlo.invalid/graphql';
const STORY_ID = 'mocking-sockets--default';

type Listener = (event: unknown) => void;

/** The real WebSocket, as far as these tests go: every socket built here reached the network. */
class NetworkSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static built: string[] = [];

  readyState = 0;
  onopen: Listener | null = null;
  onerror: Listener | null = null;
  onclose: Listener | null = null;
  onmessage: Listener | null = null;

  constructor(readonly url: string) {
    NetworkSocket.built.push(url);
  }

  send(): void {}
  close(): void {}
}

/** Feeld's own class (apollo/client/UserAgentWebSocket.ts), which binds the global when defined. */
function appSocketClass(): typeof NetworkSocket {
  const Base = (globalThis as unknown as { WebSocket: typeof NetworkSocket }).WebSocket;
  return class UserAgentWebSocket extends Base {};
}

function openSocket(url = SUBSCRIPTIONS): NetworkSocket {
  const Socket = (globalThis as unknown as { WebSocket: typeof NetworkSocket }).WebSocket;
  return new Socket(url);
}

/** Every event `socket` fires, in order, as `<type>` or `<type>:<close code>`. */
function eventsOf(socket: NetworkSocket): string[] {
  const events: string[] = [];
  const note = (type: string) => (event: unknown) => {
    const code = (event as { code?: number }).code;
    events.push(code === undefined ? type : `${type}:${code}`);
  };
  socket.onopen = note('open');
  socket.onerror = note('error');
  socket.onclose = note('close');
  socket.onmessage = note('message');
  return events;
}

// A capture, as the polyfill's watcher reports one in testing mode (metro/polyfill.js `isCapture`).
const captureWatcher = {
  isTesting: true,
  isCapture: () => mockGetMode() === 'testing',
  startStory: () => {},
  readStory: () => [],
};

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
  (globalThis as { __sherloStillReal?: unknown }).__sherloStillReal = captureWatcher;
  vi.stubGlobal('WebSocket', NetworkSocket);
  NetworkSocket.built = [];
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { __sherloStillReal?: unknown }).__sherloStillReal;
  delete NativeModules.SourceCode;
  clearMocks();
  clearStoryError(STORY_ID);
  __releaseWebSocketsForTests();
  vi.unstubAllGlobals();
  __resetStorybookFactsForTests();
});

async function activateStory(story: StoryMocks): Promise<void> {
  startStorybookHolding(
    [
      {
        importPath: './src/Sockets.stories.tsx',
        title: 'Mocking/Sockets',
        fileExports: {
          default: { title: 'Mocking/Sockets' },
          Default: { parameters: { sherlo: { mocks: story } } },
        },
        stories: [{ id: STORY_ID, name: 'Default' }],
      },
    ],
    undefined
  );
  await activateMocksForStory(STORY_ID);
}

describe('WebSockets in a story with network mocks', () => {
  it('a socket no rule matches never reaches the network: it is refused, listed as WS, and errors the story', async () => {
    vi.useFakeTimers();
    await activateStory([mockRequest({ url: 'https://api.sherlo.invalid/*' }, { body: {} })]);

    const socket = openSocket();
    const events = eventsOf(socket);
    expect(events, 'nothing fires before the app can listen').toEqual([]);
    await vi.advanceTimersByTimeAsync(0);

    expect(NetworkSocket.built).toEqual([]);
    expect(events).toEqual([`error:${SOCKET_REFUSED_CODE}`, `close:${SOCKET_REFUSED_CODE}`]);
    expect(socket.readyState).toBe(NetworkSocket.CLOSED);
    expect(unansweredRequests()).toEqual([{ method: 'WS', url: SUBSCRIPTIONS }]);
    expect(readStoryError(STORY_ID)?.message).toBe(`no mock rule matches WS ${SUBSCRIPTIONS}`);
  });

  it('passthrough lets requests through, never a socket', async () => {
    await activateStory([mockRequest.passthrough()]);

    openSocket();

    expect(NetworkSocket.built).toEqual([]);
    expect(unansweredRequests()).toEqual([{ method: 'WS', url: SUBSCRIPTIONS }]);
  });

  it("'pending' holds the socket CONNECTING for good, fires nothing, and is listed nowhere", async () => {
    vi.useFakeTimers();
    await activateStory([
      mockRequest.socket({ url: 'wss://subscriptions.sherlo.invalid/*' }, 'pending'),
    ]);

    const socket = openSocket();
    const events = eventsOf(socket);
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(NetworkSocket.built).toEqual([]);
    expect(events).toEqual([]);
    expect(socket.readyState).toBe(NetworkSocket.CONNECTING);
    expect(unansweredRequests()).toEqual([]);
    expect(readStoryError(STORY_ID)).toBeUndefined();
  });

  it("'refuse' fires error then close with the fixed code, and errors no story", async () => {
    vi.useFakeTimers();
    await activateStory([mockRequest.socket({ url: /subscriptions/ }, 'refuse')]);

    const socket = openSocket();
    const events = eventsOf(socket);
    await vi.advanceTimersByTimeAsync(0);

    expect(NetworkSocket.built).toEqual([]);
    expect(events).toEqual([`error:${SOCKET_REFUSED_CODE}`, `close:${SOCKET_REFUSED_CODE}`]);
    expect(unansweredRequests()).toEqual([]);
    expect(readStoryError(STORY_ID)).toBeUndefined();
  });

  it('a held socket is never a request in flight, so the ready rule never waits on it', async () => {
    await activateStory([mockRequest.socket({ url: SUBSCRIPTIONS }, 'pending')]);

    openSocket();

    expect(requestsInFlight()).toEqual([]);
  });

  it('a class the app derived from WebSocket once the SDK was in is held too', async () => {
    holdWebSockets();
    const UserAgentWebSocket = appSocketClass();
    await activateStory([mockRequest.socket({ url: SUBSCRIPTIONS }, 'pending')]);

    const socket = new UserAgentWebSocket(SUBSCRIPTIONS);

    expect(NetworkSocket.built).toEqual([]);
    expect(socket.readyState).toBe(NetworkSocket.CONNECTING);
  });

  it("the bundler's own socket (hot reload) is never a story's", async () => {
    NativeModules.SourceCode = { scriptURL: 'http://localhost:50524/index.bundle?platform=ios' };
    await activateStory([mockRequest({ url: 'https://api.sherlo.invalid/*' }, { body: {} })]);

    openSocket('ws://localhost:50524/hot');

    expect(NetworkSocket.built).toEqual(['ws://localhost:50524/hot']);
    expect(unansweredRequests()).toEqual([]);
  });
});

describe('WebSockets in a story with no network mock', () => {
  it('in a capture the socket reaches the network and is listed', async () => {
    await activateStory([]);

    const socket = openSocket();

    expect(NetworkSocket.built).toEqual([SUBSCRIPTIONS]);
    expect(socket).toBeInstanceOf(NetworkSocket);
    expect(unansweredRequests()).toEqual([{ method: 'WS', url: SUBSCRIPTIONS }]);
  });

  it("outside a capture it is the app's own socket, listed nowhere", async () => {
    mockGetMode.mockReturnValue('storybook');
    await activateStory([]);

    openSocket();

    expect(NetworkSocket.built).toEqual([SUBSCRIPTIONS]);
    expect(unansweredRequests()).toEqual([]);
  });
});

describe("Feeld's subscription client (graphql-ws) under each answer", () => {
  /**
   * One boot: the SDK goes in, the app defines its socket class and its client the way Feeld does
   * (apollo/client/links.tsx: lazy, retry on everything, 10 attempts, 10 s keep-alive), the story
   * activates, a subscription starts, and ten minutes pass. Returns everything that happened.
   */
  async function bootWith(story: StoryMocks): Promise<string[]> {
    vi.useFakeTimers();
    holdWebSockets();
    const UserAgentWebSocket = appSocketClass();
    const trace: string[] = [];
    const client = createClient({
      url: SUBSCRIPTIONS,
      webSocketImpl: UserAgentWebSocket,
      lazy: true,
      shouldRetry: () => true,
      retryAttempts: 10,
      keepAlive: 10_000,
      on: {
        connecting: (isRetry) => trace.push(`connecting retry=${isRetry}`),
        opened: () => trace.push('opened'),
        closed: (event) => trace.push(`closed:${(event as { code: number }).code}`),
        error: () => trace.push('error'),
      },
    });
    await activateStory(story);

    client.subscribe(
      { query: 'subscription Messages { messages { id } }' },
      {
        next: () => trace.push('next'),
        error: (error) => trace.push(`sink error:${(error as { code?: number }).code}`),
        complete: () => trace.push('complete'),
      }
    );
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    trace.push(`sockets reaching the network: ${NetworkSocket.built.length}`);

    // Not awaited: graphql-ws's dispose waits for a socket still connecting, which a pending one is
    // for good.
    client.dispose();
    __releaseWebSocketsForTests();
    vi.useRealTimers();
    return trace;
  }

  it("'pending': one socket, held CONNECTING, no retry, the same on every boot", async () => {
    const story = [mockRequest.socket({ url: SUBSCRIPTIONS }, 'pending')];

    const first = await bootWith(story);
    const second = await bootWith(story);

    expect(first).toEqual(['connecting retry=false', 'sockets reaching the network: 0']);
    expect(second).toEqual(first);
  });

  it("'refuse': a fatal close graphql-ws never retries, the same on every boot", async () => {
    const story = [mockRequest.socket({ url: SUBSCRIPTIONS }, 'refuse')];

    const first = await bootWith(story);
    const second = await bootWith(story);

    expect(first).toEqual([
      'connecting retry=false',
      'error',
      `closed:${SOCKET_REFUSED_CODE}`,
      `sink error:${SOCKET_REFUSED_CODE}`,
      'sockets reaching the network: 0',
    ]);
    expect(second).toEqual(first);
  });
});
