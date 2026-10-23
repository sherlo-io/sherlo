/**
 * A story with network mocks holds every WebSocket its screen opens: a socket rule answers it
 * ('pending' or 'refuse'), and one no rule matches is refused and listed like an unmatched
 * request. No socket in such a story reaches the network, so a scene whose app opens a
 * subscription socket on boot (Apollo's GraphQLWsLink over graphql-ws) settles the same way on
 * every boot - whichever WebSocket class the app opens it with, and whenever that class was
 * defined.
 *
 * "The network" here is React Native's WebSocketModule: a stand-in that counts every connection
 * it was asked for. The WebSocket class is a stand-in for React Native's own
 * (Libraries/WebSocket/WebSocket.js): it connects through that module in its constructor and hears
 * back through the device event emitter, by socket id.
 */
import { createClient } from 'graphql-ws';

const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import { DeviceEventEmitter, NativeModules } from 'react-native';
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

/** React Native's WebSocketModule, as far as these tests go: every connect reached the network. */
const WebSocketModule = {
  connected: [] as string[],
  connect(url: string, _protocols: unknown, _options: unknown, _socketId: number): void {
    WebSocketModule.connected.push(url);
  },
  close(_code: number, _reason: string, _socketId: number): void {},
};

let nextSocketId = 0;

/** React Native's WebSocket class, cut to what a client touches. */
class ReactNativeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = 0;
  onopen: Listener | null = null;
  onerror: Listener | null = null;
  onclose: Listener | null = null;
  onmessage: Listener | null = null;
  private readonly socketId = nextSocketId++;
  private readonly listeners = new Map<string, Set<Listener>>();
  private subscriptions: Array<{ remove: () => void }>;

  constructor(
    readonly url: string,
    protocols?: unknown
  ) {
    const ownId = (event: { id: number }) => event.id === this.socketId;
    this.subscriptions = [
      DeviceEventEmitter.addListener('websocketOpen', (event: { id: number }) => {
        if (!ownId(event)) return;
        this.readyState = ReactNativeWebSocket.OPEN;
        this.dispatch('open', {});
      }),
      DeviceEventEmitter.addListener(
        'websocketClosed',
        (event: { id: number; code: number; reason: string }) => {
          if (!ownId(event)) return;
          this.readyState = ReactNativeWebSocket.CLOSED;
          this.dispatch('close', { code: event.code, reason: event.reason });
          this.unregister();
        }
      ),
      DeviceEventEmitter.addListener(
        'websocketFailed',
        (event: { id: number; message: string }) => {
          if (!ownId(event)) return;
          this.readyState = ReactNativeWebSocket.CLOSED;
          this.dispatch('error', {});
          this.dispatch('close', { code: 1006, reason: event.message });
          this.unregister();
        }
      ),
    ];
    WebSocketModule.connect(url, protocols ?? null, { headers: {} }, this.socketId);
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(): void {
    if (this.readyState === ReactNativeWebSocket.CONNECTING) throw new Error('INVALID_STATE_ERR');
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= ReactNativeWebSocket.CLOSING) return;
    this.readyState = ReactNativeWebSocket.CLOSING;
    WebSocketModule.close(code ?? 1000, reason ?? '', this.socketId);
  }

  private dispatch(type: string, fields: object): void {
    const event = { type, target: this, ...fields };
    const handler = this[`on${type}` as 'onopen'];
    if (typeof handler === 'function') handler.call(this, event);
    this.listeners.get(type)?.forEach((listener) => listener.call(this, event));
  }

  private unregister(): void {
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
  }
}

/**
 * Feeld's own class (apollo/client/UserAgentWebSocket.ts), defined here at module load - before
 * Sherlo held anything - and binding React Native's class as it stood then.
 */
class UserAgentWebSocketDefinedFirst extends ReactNativeWebSocket {}

/** An app's class derived from whatever the global WebSocket is at the moment it is defined. */
function appSocketClass(): typeof ReactNativeWebSocket {
  const Base = (globalThis as unknown as { WebSocket: typeof ReactNativeWebSocket }).WebSocket;
  return class UserAgentWebSocket extends Base {};
}

function openSocket(url = SUBSCRIPTIONS): ReactNativeWebSocket {
  const Socket = (globalThis as unknown as { WebSocket: typeof ReactNativeWebSocket }).WebSocket;
  return new Socket(url);
}

/** Every event `socket` fires, in order, as `<type>` or `<type>:<close code>`. */
function eventsOf(socket: ReactNativeWebSocket): string[] {
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
  vi.stubGlobal('WebSocket', ReactNativeWebSocket);
  NativeModules.WebSocketModule = WebSocketModule;
  WebSocketModule.connected = [];
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { __sherloStillReal?: unknown }).__sherloStillReal;
  delete NativeModules.SourceCode;
  clearMocks();
  clearStoryError(STORY_ID);
  __releaseWebSocketsForTests();
  delete NativeModules.WebSocketModule;
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

    expect(WebSocketModule.connected).toEqual([]);
    expect(events).toEqual([`close:${SOCKET_REFUSED_CODE}`]);
    expect(socket.readyState).toBe(ReactNativeWebSocket.CLOSED);
    expect(unansweredRequests()).toEqual([{ method: 'WS', url: SUBSCRIPTIONS }]);
    expect(readStoryError(STORY_ID)?.message).toBe(`no mock rule matches WS ${SUBSCRIPTIONS}`);
  });

  it('passthrough lets requests through, never a socket', async () => {
    await activateStory([mockRequest.passthrough()]);

    openSocket();

    expect(WebSocketModule.connected).toEqual([]);
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

    expect(WebSocketModule.connected).toEqual([]);
    expect(events).toEqual([]);
    expect(socket.readyState).toBe(ReactNativeWebSocket.CONNECTING);
    expect(unansweredRequests()).toEqual([]);
    expect(readStoryError(STORY_ID)).toBeUndefined();
  });

  it('a pending socket the app closes ends with its own code, on the next tick', async () => {
    vi.useFakeTimers();
    await activateStory([mockRequest.socket({ url: SUBSCRIPTIONS }, 'pending')]);

    const socket = openSocket();
    const events = eventsOf(socket);
    socket.close(4499, 'Terminated');
    await vi.advanceTimersByTimeAsync(0);

    expect(events).toEqual(['close:4499']);
    expect(socket.readyState).toBe(ReactNativeWebSocket.CLOSED);
  });

  it("'refuse' fires a close with the fixed code, and errors no story", async () => {
    vi.useFakeTimers();
    await activateStory([mockRequest.socket({ url: /subscriptions/ }, 'refuse')]);

    const socket = openSocket();
    const events = eventsOf(socket);
    await vi.advanceTimersByTimeAsync(0);

    expect(WebSocketModule.connected).toEqual([]);
    expect(events).toEqual([`close:${SOCKET_REFUSED_CODE}`]);
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

    expect(WebSocketModule.connected).toEqual([]);
    expect(socket.readyState).toBe(ReactNativeWebSocket.CONNECTING);
  });

  it('a class the app derived from WebSocket before the SDK ran is held, and stays its own class', async () => {
    vi.useFakeTimers();
    await activateStory([mockRequest({ url: 'https://api.sherlo.invalid/*' }, { body: {} })]);

    const socket = new UserAgentWebSocketDefinedFirst(SUBSCRIPTIONS);
    const events = eventsOf(socket);
    await vi.advanceTimersByTimeAsync(0);

    expect(WebSocketModule.connected).toEqual([]);
    expect(socket).toBeInstanceOf(UserAgentWebSocketDefinedFirst);
    expect(events).toEqual([`close:${SOCKET_REFUSED_CODE}`]);
    expect(unansweredRequests()).toEqual([{ method: 'WS', url: SUBSCRIPTIONS }]);
  });

  it("the bundler's own socket (hot reload) is never a story's", async () => {
    NativeModules.SourceCode = { scriptURL: 'http://localhost:50524/index.bundle?platform=ios' };
    await activateStory([mockRequest({ url: 'https://api.sherlo.invalid/*' }, { body: {} })]);

    openSocket('ws://localhost:50524/hot');

    expect(WebSocketModule.connected).toEqual(['ws://localhost:50524/hot']);
    expect(unansweredRequests()).toEqual([]);
  });
});

describe('WebSockets in a story with no network mock', () => {
  it('in a capture the socket reaches the network and is listed', async () => {
    await activateStory([]);

    const socket = openSocket();

    expect(WebSocketModule.connected).toEqual([SUBSCRIPTIONS]);
    expect(socket).toBeInstanceOf(ReactNativeWebSocket);
    expect(unansweredRequests()).toEqual([{ method: 'WS', url: SUBSCRIPTIONS }]);
  });

  it("outside a capture it is the app's own socket, listed nowhere", async () => {
    mockGetMode.mockReturnValue('storybook');
    await activateStory([]);

    openSocket();
    new UserAgentWebSocketDefinedFirst(SUBSCRIPTIONS);

    expect(WebSocketModule.connected).toEqual([SUBSCRIPTIONS, SUBSCRIPTIONS]);
    expect(unansweredRequests()).toEqual([]);
  });

  it("in an app in default mode React Native's socket calls are never touched", async () => {
    mockGetMode.mockReturnValue('default');
    const { connect, close } = WebSocketModule;
    await activateStory([mockRequest.socket({ url: SUBSCRIPTIONS }, 'pending')]);
    holdWebSockets();

    new UserAgentWebSocketDefinedFirst(SUBSCRIPTIONS);

    expect(WebSocketModule.connect).toBe(connect);
    expect(WebSocketModule.close).toBe(close);
    expect(WebSocketModule.connected).toEqual([SUBSCRIPTIONS]);
  });
});

describe("Feeld's subscription client (graphql-ws) under each answer", () => {
  /**
   * One boot: the app's socket class exists before Sherlo does (Feeld's UserAgentWebSocket is
   * evaluated when AppRoot imports apollo/client, ahead of the SDK), the app builds its client the
   * way Feeld does (apollo/client/links.tsx: its class as webSocketImpl, lazy, retry on everything,
   * 10 attempts, 10 s keep-alive), the story activates, a subscription starts, and ten minutes
   * pass. Returns everything that happened.
   */
  async function bootWith(story: StoryMocks): Promise<string[]> {
    vi.useFakeTimers();
    WebSocketModule.connected = [];
    const trace: string[] = [];
    const client = createClient({
      url: SUBSCRIPTIONS,
      webSocketImpl: UserAgentWebSocketDefinedFirst,
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
    trace.push(`sockets reaching the network: ${WebSocketModule.connected.length}`);

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
      `closed:${SOCKET_REFUSED_CODE}`,
      `sink error:${SOCKET_REFUSED_CODE}`,
      'sockets reaching the network: 0',
    ]);
    expect(second).toEqual(first);
  });

  it('an unmatched socket is refused the same way and listed as WS', async () => {
    const first = await bootWith([
      mockRequest({ url: 'https://api.sherlo.invalid/*' }, { body: {} }),
    ]);

    expect(first).toEqual([
      'connecting retry=false',
      `closed:${SOCKET_REFUSED_CODE}`,
      `sink error:${SOCKET_REFUSED_CODE}`,
      'sockets reaching the network: 0',
    ]);
    expect(unansweredRequests()).toEqual([{ method: 'WS', url: SUBSCRIPTIONS }]);
  });
});
