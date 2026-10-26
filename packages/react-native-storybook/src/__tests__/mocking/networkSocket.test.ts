/**
 * A story with network mocks holds every WebSocket its screen opens: a socket rule answers it
 * ('pending' or 'refuse'), and one no rule matches is refused and listed like an unmatched
 * request. No socket in such a story reaches the network, so a scene whose app opens a
 * subscription socket on boot settles the same way on every boot - whichever WebSocket class the
 * app opens it with, and whenever that class was defined.
 *
 * "The network" here is React Native's WebSocketModule: a stand-in that counts every connection
 * it was asked for. The WebSocket class is a stand-in for React Native's own
 * (Libraries/WebSocket/WebSocket.js): it connects through that module in its constructor and hears
 * back through the device event emitter, by socket id.
 */
const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import { DeviceEventEmitter, NativeModules, TurboModuleRegistry } from 'react-native';
import { activateMocksForStory } from '../../getStorybook/storyMockActivation';
import { clearStoryError, readStoryError } from '../../getStorybook/storyErrorRegistry';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { mockRequest } from '../../mocking/networkDeclaration';
import { __releaseWebSocketsForTests, holdWebSockets } from '../../mocking/network';
import { unansweredRequests } from '../../mocking/networkRules';
import { SOCKET_REFUSED_CODE } from '../../mocking/networkSocket';
import { clearMocks } from '../../mocking/registry';
import type { StoryMocks } from '../../mocking/mockDeclaration';
import { startStorybookHolding } from './storybookHolding';

const SUBSCRIPTIONS = 'wss://subscriptions.sherlo.invalid/graphql';
const DEVTOOLS = 'ws://localhost:8097';
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
  private subscriptions: Array<{ remove: () => void }>;

  constructor(
    readonly url: string,
    protocols?: unknown
  ) {
    const ownId = (event: { id: number }) => event.id === this.socketId;
    this.subscriptions = [
      DeviceEventEmitter.addListener(
        'websocketClosed',
        (event: { id: number; code: number; reason: string }) => {
          if (!ownId(event)) return;
          this.readyState = ReactNativeWebSocket.CLOSED;
          this.dispatch('close', { code: event.code, reason: event.reason });
          this.unregister();
        }
      ),
    ];
    WebSocketModule.connect(url, protocols ?? null, { headers: {} }, this.socketId);
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= ReactNativeWebSocket.CLOSING) return;
    this.readyState = ReactNativeWebSocket.CLOSING;
    WebSocketModule.close(code ?? 1000, reason ?? '', this.socketId);
  }

  private dispatch(type: string, fields: object): void {
    const handler = this[`on${type}` as 'onopen'];
    if (typeof handler === 'function') handler.call(this, { type, target: this, ...fields });
  }

  private unregister(): void {
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
  }
}

/**
 * An app's own class, defined here at module load - before Sherlo held anything - and binding
 * React Native's class as it stood then.
 */
class AppSocketDefinedFirst extends ReactNativeWebSocket {}

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

const OTHER_API = [mockRequest({ url: 'https://api.sherlo.invalid/*' }, { body: {} })];

describe('WebSockets in a story with network mocks', () => {
  it('a socket no rule matches never reaches the network: it is refused, listed as WS, and errors the story', async () => {
    vi.useFakeTimers();
    await activateStory(OTHER_API);

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

  it("React DevTools' standalone socket on 8097 is refused", async () => {
    vi.useFakeTimers();
    NativeModules.SourceCode = { scriptURL: 'http://localhost:50524/index.bundle?platform=ios' };
    await activateStory(OTHER_API);

    const socket = openSocket(DEVTOOLS);
    const events = eventsOf(socket);
    await vi.advanceTimersByTimeAsync(0);

    expect(WebSocketModule.connected).toEqual([]);
    expect(events).toEqual([`close:${SOCKET_REFUSED_CODE}`]);
    expect(unansweredRequests()).toEqual([{ method: 'WS', url: DEVTOOLS }]);
  });

  it('a class the app derived from WebSocket once the SDK was in is held too', async () => {
    holdWebSockets();
    const Base = (globalThis as unknown as { WebSocket: typeof ReactNativeWebSocket }).WebSocket;
    class AppSocket extends Base {}
    await activateStory([mockRequest.socket({ url: SUBSCRIPTIONS }, 'pending')]);

    const socket = new AppSocket(SUBSCRIPTIONS);

    expect(WebSocketModule.connected).toEqual([]);
    expect(socket.readyState).toBe(ReactNativeWebSocket.CONNECTING);
  });

  it('a class the app derived from WebSocket before the SDK ran is held, and stays its own class', async () => {
    vi.useFakeTimers();
    await activateStory(OTHER_API);

    const socket = new AppSocketDefinedFirst(SUBSCRIPTIONS);
    const events = eventsOf(socket);
    await vi.advanceTimersByTimeAsync(0);

    expect(WebSocketModule.connected).toEqual([]);
    expect(socket).toBeInstanceOf(AppSocketDefinedFirst);
    expect(events).toEqual([`close:${SOCKET_REFUSED_CODE}`]);
    expect(unansweredRequests()).toEqual([{ method: 'WS', url: SUBSCRIPTIONS }]);
  });

  it("a mocked story keeps every socket to the bundler the dev tools use, and still refuses the app's own sockets", async () => {
    vi.useFakeTimers();
    NativeModules.SourceCode = { scriptURL: 'http://localhost:50524/index.bundle?platform=ios' };
    await activateStory(OTHER_API);

    const devTools = [
      'ws://localhost:50524/hot',
      // React Native 0.83 hands Fast Refresh's socket to the native module with an http scheme.
      'http://localhost:50524/hot',
      'ws://localhost:50524/message',
      'ws://127.0.0.1:50524/inspector/debug?device=1&page=1',
    ];
    devTools.forEach((url) => openSocket(url));
    const foreignHost = eventsOf(openSocket('ws://api.sherlo.invalid:50524/hot'));
    const otherPort = eventsOf(openSocket('ws://localhost:9999/hot'));
    await vi.advanceTimersByTimeAsync(0);

    expect(WebSocketModule.connected).toEqual(devTools);
    expect(foreignHost).toEqual([`close:${SOCKET_REFUSED_CODE}`]);
    expect(otherPort).toEqual([`close:${SOCKET_REFUSED_CODE}`]);
    // Only the app's own two sockets are listed; the bundler's are never unanswered.
    expect(unansweredRequests()).toEqual([
      { method: 'WS', url: 'ws://api.sherlo.invalid:50524/hot' },
      { method: 'WS', url: 'ws://localhost:9999/hot' },
    ]);
  });

  it("the bundler's address is read from the SourceCode TurboModule when NativeModules has none", async () => {
    const sourceCode = {
      getConstants: () => ({ scriptURL: 'http://localhost:50524/index.bundle' }),
    };
    const lookup = vi
      .spyOn(TurboModuleRegistry, 'get')
      .mockImplementation(((name: string) => (name === 'SourceCode' ? sourceCode : null)) as never);
    delete NativeModules.SourceCode;
    await activateStory(OTHER_API);

    openSocket('http://localhost:50524/hot');

    expect(WebSocketModule.connected).toEqual(['http://localhost:50524/hot']);
    expect(unansweredRequests()).toEqual([]);
    lookup.mockRestore();
  });

  it.each([
    ['[::1]', 'http://[::1]:50524/index.bundle', 'ws://[::1]:50524/hot'],
    ['10.0.2.2', 'http://10.0.2.2:50524/index.bundle', 'ws://localhost:50524/hot'],
    ['10.0.2.2 the other way', 'http://localhost:50524/index.bundle', 'ws://10.0.2.2:50524/hot'],
  ])(
    'a bundler spelled %s still gets its dev-tools socket for real',
    async (_name, script, hot) => {
      NativeModules.SourceCode = { scriptURL: script };
      await activateStory(OTHER_API);

      openSocket(hot);

      expect(WebSocketModule.connected).toEqual([hot]);
      expect(unansweredRequests()).toEqual([]);
    }
  );
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
    new AppSocketDefinedFirst(SUBSCRIPTIONS);

    expect(WebSocketModule.connected).toEqual([SUBSCRIPTIONS, SUBSCRIPTIONS]);
    expect(unansweredRequests()).toEqual([]);
  });

  it("in an app in default mode React Native's socket calls are never touched", async () => {
    mockGetMode.mockReturnValue('default');
    const { connect, close } = WebSocketModule;
    await activateStory([mockRequest.socket({ url: SUBSCRIPTIONS }, 'pending')]);
    holdWebSockets();

    new AppSocketDefinedFirst(SUBSCRIPTIONS);

    expect(WebSocketModule.connect).toBe(connect);
    expect(WebSocketModule.close).toBe(close);
    expect(WebSocketModule.connected).toEqual([SUBSCRIPTIONS]);
  });
});
