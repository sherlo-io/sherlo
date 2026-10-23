import type { SocketAnswer } from './networkDeclaration';
import { socketVerdictFor } from './networkRules';

/**
 * THE WEBSOCKET HALF OF THE INTERCEPTOR - a WebSocket class that asks the rules in effect about
 * every socket the app opens, and hands back a socket that never reaches the network whenever
 * they hold it.
 *
 * It replaces the global WebSocket for good once installed (./network), because an app often
 * captures the class long before any story runs: `class AppSocket extends WebSocket` binds the
 * global at the moment its module is evaluated. Calling this class with `new`, directly or
 * through such a subclass, asks the rules at that moment; with no story's mocks in effect it
 * builds the real socket, exactly as the real class would.
 *
 * A held socket is never counted as a request in flight (./requestsInFlight): a socket stays
 * open for the life of a screen, so a story that waited for it would never be ready.
 */

/**
 * The close code a refused socket reports. graphql-ws treats every 1000-1999 code but 1000, 1001,
 * 1005, 1006 and 1012-1014 as fatal, so a client built on it gives up at once instead of retrying
 * with a randomised backoff that would differ between boots. 1008 is "policy violation".
 */
export const SOCKET_REFUSED_CODE = 1008;
export const SOCKET_REFUSED_REASON = 'Sherlo refused this socket: no real socket in a mocked story';

const CONNECTING = 0;
const CLOSING = 2;
const CLOSED = 3;

type Listener = (event: unknown) => void;

/** The parts of a WebSocket class the wrapper reads: something to build, and its four states. */
export type WebSocketClass = (new (url: string, ...rest: unknown[]) => object) & {
  CONNECTING: number;
  OPEN: number;
  CLOSING: number;
  CLOSED: number;
};

/**
 * `RealWebSocket`, asking the rules in effect about every socket opened. A socket for which
 * `isSherlosOwn` holds (the bundler's own, e.g. hot reload) is never asked about.
 */
export function mockedWebSocketOf(
  RealWebSocket: WebSocketClass,
  isSherlosOwn: (url: string) => boolean
): WebSocketClass {
  function SherloWebSocket(this: unknown, url: unknown, ...rest: unknown[]): object {
    const address = String(url);
    const verdict = isSherlosOwn(address) ? { kind: 'real' as const } : socketVerdictFor(address);

    // Built with the caller's own class, so a subclass of this one keeps its prototype.
    if (verdict.kind === 'real') {
      return Reflect.construct(RealWebSocket, [url, ...rest], new.target ?? SherloWebSocket);
    }
    return heldSocket(address, verdict.kind === 'answer' ? verdict.answer : 'refuse');
  }

  // Shares the real prototype and statics, so `instanceof`, CONNECTING..CLOSED and anything a
  // subclass inherits read as they did before.
  SherloWebSocket.prototype = RealWebSocket.prototype;
  Object.setPrototypeOf(SherloWebSocket, RealWebSocket);

  return SherloWebSocket as unknown as WebSocketClass;
}

/**
 * A socket that never reaches the network. It speaks the WebSocket surface a client uses -
 * readyState, on<event> handlers, addEventListener, send, close - and nothing more.
 */
function heldSocket(url: string, answer: SocketAnswer): object {
  const listeners = new Map<string, Set<Listener>>();

  const socket = {
    CONNECTING,
    OPEN: 1,
    CLOSING,
    CLOSED,
    url,
    protocol: '',
    extensions: '',
    bufferedAmount: 0,
    binaryType: 'blob',
    readyState: CONNECTING,
    onopen: null as Listener | null,
    onmessage: null as Listener | null,
    onerror: null as Listener | null,
    onclose: null as Listener | null,

    addEventListener(type: string, listener: Listener): void {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },

    removeEventListener(type: string, listener: Listener): void {
      listeners.get(type)?.delete(listener);
    },

    dispatchEvent(event: { type: string }): boolean {
      fire(event.type, event);
      return true;
    },

    /** A socket that never opened cannot send, as a real one in CONNECTING cannot. */
    send(): void {
      throw new Error('INVALID_STATE_ERR: the socket is not open');
    },

    /** Closed by the app: it ends the way a real socket the app closed ends, on the next tick. */
    close(code?: number, reason?: string): void {
      if (socket.readyState >= CLOSING) return;
      socket.readyState = CLOSING;
      setTimeout(() => {
        socket.readyState = CLOSED;
        fire('close', { type: 'close', code: code ?? 1005, reason: reason ?? '', wasClean: true });
      }, 0);
    },
  };

  function fire(type: string, event: object): void {
    const withTarget = { ...event, target: socket, currentTarget: socket };
    const handler = socket[`on${type}` as 'onopen' | 'onmessage' | 'onerror' | 'onclose'];
    if (typeof handler === 'function') handler.call(socket, withTarget);
    listeners.get(type)?.forEach((listener) => listener.call(socket, withTarget));
  }

  if (answer === 'refuse') {
    // Never at once: a client sets its handlers after `new`, as it does for a real socket.
    setTimeout(() => {
      if (socket.readyState !== CONNECTING) return;
      socket.readyState = CLOSED;
      const closing = { code: SOCKET_REFUSED_CODE, reason: SOCKET_REFUSED_REASON, wasClean: false };
      // The error carries the close code too: graphql-ws gives up on the first event it hears, and
      // an error with no code is one it retries with a randomised wait.
      fire('error', { type: 'error', message: SOCKET_REFUSED_REASON, ...closing });
      fire('close', { type: 'close', ...closing });
    }, 0);
  }

  return socket;
}
