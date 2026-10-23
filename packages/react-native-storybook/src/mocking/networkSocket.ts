import { DeviceEventEmitter } from 'react-native';
import { socketVerdictFor } from './networkRules';

/**
 * THE WEBSOCKET HALF OF THE INTERCEPTOR - held below the JavaScript class, at the native module
 * every React Native WebSocket opens its connection through.
 *
 * React Native's WebSocket calls `WebSocketModule.connect(url, protocols, options, id)` in its
 * constructor and hears back through the device event emitter (`websocketOpen`, `websocketClosed`,
 * `websocketFailed`, `websocketMessage`, each carrying that id). So does every class derived from
 * it, through `super()`, whenever it was defined: `class AppSocket extends WebSocket` evaluated
 * before the SDK, handed to a client as its own `webSocketImpl`, still connects here. Replacing
 * the global class instead misses exactly those.
 *
 * The module object is one shared JavaScript object in both architectures: the legacy bridge's
 * NativeModules entry, or a TurboModule's cached JS representation (a plain object whose prototype
 * is the host object). `Object.defineProperty` gives it an own `connect` and `close`; with no
 * story's mocks in effect they call the real ones, so the socket is exactly the app's own.
 *
 * A held socket stays in the app's own class, CONNECTING; it never reaches the network.
 */

/**
 * The close code a refused socket reports. graphql-ws treats every 1000-1999 code but 1000, 1001,
 * 1005, 1006 and 1012-1014 as fatal, so a client built on it gives up at once instead of retrying
 * with a randomised backoff that would differ between boots. 1008 is "policy violation".
 */
export const SOCKET_REFUSED_CODE = 1008;
export const SOCKET_REFUSED_REASON = 'Sherlo refused this socket: no real socket in a mocked story';

/** The two calls of React Native's WebSocketModule the hold replaces. */
export type NativeSocketModule = {
  connect: (url: string, protocols: unknown, options: unknown, socketId: number) => void;
  close: (code: number, reason: string, socketId: number) => void;
};

/**
 * Hold `nativeSockets`: every socket opened through it asks the rules in effect. A socket for which
 * `isSherlosOwn` holds (the bundler's own socket: React DevTools connects to the same host and
 * port when the bundle came from the bundler) is never asked about. Returns what puts the real
 * calls back.
 */
export function holdNativeSockets(
  nativeSockets: NativeSocketModule,
  isSherlosOwn: (url: string) => boolean
): () => void {
  const realConnect = nativeSockets.connect;
  const realClose = nativeSockets.close;
  /** Ids of the sockets held here, which the real module never heard of. */
  const held = new Set<number>();

  function connect(url: string, protocols: unknown, options: unknown, socketId: number): void {
    const address = String(url);
    const verdict = isSherlosOwn(address) ? { kind: 'real' as const } : socketVerdictFor(address);
    if (verdict.kind === 'real') {
      realConnect.call(nativeSockets, url, protocols, options, socketId);
      return;
    }

    held.add(socketId);
    // 'pending' fires nothing: the socket stays CONNECTING. Refused, never at once: the app sets
    // its handlers after `new`, as it does for a real socket. Only a close is sent: React Native
    // turns `websocketFailed` into an error and a 1006 close, which graphql-ws retries with a
    // randomised wait.
    if (verdict.kind !== 'answer' || verdict.answer === 'refuse') {
      setTimeout(() => endHeld(socketId, SOCKET_REFUSED_CODE, SOCKET_REFUSED_REASON), 0);
    }
  }

  /** Closed by the app: it ends the way a real socket the app closed ends, on the next tick. */
  function close(code: number, reason: string, socketId: number): void {
    if (!held.has(socketId)) {
      realClose.call(nativeSockets, code, reason, socketId);
      return;
    }
    setTimeout(() => endHeld(socketId, code, reason), 0);
  }

  function endHeld(socketId: number, code: number, reason: string): void {
    if (!held.delete(socketId)) return;
    DeviceEventEmitter.emit('websocketClosed', { id: socketId, code, reason });
  }

  replaceCall(nativeSockets, 'connect', connect);
  replaceCall(nativeSockets, 'close', close);
  return () => {
    replaceCall(nativeSockets, 'connect', realConnect);
    replaceCall(nativeSockets, 'close', realClose);
  };
}

/**
 * An own property, defined rather than assigned: assigning to a TurboModule's JS representation a
 * name it has not cached yet would reach its host object prototype, which refuses writes.
 */
function replaceCall(target: object, name: string, call: unknown): void {
  Object.defineProperty(target, name, { value: call, writable: true, configurable: true });
}
