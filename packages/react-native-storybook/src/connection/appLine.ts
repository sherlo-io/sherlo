/**
 * THE APP'S LINE: the only place the JavaScript sends or receives a message over the app's one
 * connection.
 *
 * Native code holds the socket, for the life of the process, so it outlives every reload of the
 * JavaScript. This wraps its calls: a message goes out as JSON through `sendMessage`, and each one
 * the connection brings comes back as a `SherloMessage` event. Every message's shape is the seam's
 * (../sealedCore/seam). A native build from before the connection has none of these calls, and the
 * line then sends and receives nothing.
 */
import { NativeEventEmitter, NativeModules } from 'react-native';
import TurboModule from '../specs/NativeSherloModule';
import type { MessageFromTheApp, MessageToTheApp } from '../sealedCore/seam';

/** The event native code raises for each message the connection brings, with its JSON. */
const MESSAGE_EVENT = 'SherloMessage';

const nativeModule = TurboModule ?? NativeModules.SherloModule ?? null;

/** Send one message over the connection. */
export function send(message: MessageFromTheApp): void {
  if (typeof nativeModule?.sendMessage !== 'function') return;
  nativeModule.sendMessage(JSON.stringify(message));
}

/** Hear every message the connection brings from now on; the answer stops hearing them. */
export function onMessage(listener: (message: MessageToTheApp) => void): () => void {
  if (typeof nativeModule?.sendMessage !== 'function') return () => {};

  const subscription = new NativeEventEmitter(nativeModule).addListener(
    MESSAGE_EVENT,
    (messageJson: string) => listener(JSON.parse(messageJson) as MessageToTheApp)
  );
  return () => subscription.remove();
}

/** Ask native code to open the connection to `address`, the bundler's Sherlo address. */
export function dialBundler(address: string): void {
  if (typeof nativeModule?.dialBundler !== 'function') return;
  nativeModule.dialBundler(address);
}
