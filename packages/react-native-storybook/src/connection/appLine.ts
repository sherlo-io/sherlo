/**
 * THE APP'S LINE: the only place the JavaScript sends or receives a message over the app's one
 * connection.
 *
 * Native code holds the socket, for the life of the process, so it outlives every reload of the
 * JavaScript. This wraps its calls: a message goes out as JSON through `sendMessage`, and each one
 * the connection brings comes back as a `SherloMessage` event. Every message's shape is the seam's
 * (../sealedCore/seam). A native build from before the connection has none of these calls, and the
 * line then sends and receives nothing.
 *
 * Whose address the socket dials: a launch that was handed one (a run) is connected by native code
 * before any JavaScript exists. A bundle a bundler served dials that bundler's Sherlo address, which
 * `startTheLine` asks native code to do. A bundle loaded from the device, with no address handed,
 * has nothing to dial and opens no connection.
 */
import { NativeEventEmitter, NativeModules } from 'react-native';
import { bundlerOrigin } from '../bundlerOrigin';
import { BUNDLER_LINE_PATH } from '../constants';
import { JS_MODULE_VERSION } from '../sdk-compatibility.json';
import { SHERLO_PROTOCOL_VERSION } from '../sealedCore/seam';
import type { MessageFromTheApp, MessageToTheApp } from '../sealedCore/seam';
import SherloModule from '../SherloModule';
import TurboModule from '../specs/NativeSherloModule';

/** The event native code raises for each message the connection brings, with its JSON. */
const MESSAGE_EVENT = 'SherloMessage';

const nativeModule = TurboModule ?? NativeModules.SherloModule ?? null;

let hasStarted = false;

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

/**
 * Start the line, once per run of the JavaScript: say this JavaScript's `hello`, which native code
 * keeps and puts in every `hello` it says, then dial the bundler this bundle came from, if it came
 * from one.
 */
export function startTheLine(): void {
  if (hasStarted) return;
  hasStarted = true;

  send({
    action: 'hello',
    protocolVersion: SHERLO_PROTOCOL_VERSION,
    nativeVersion: SherloModule.getNativeVersion() ?? '',
    jsVersion: JS_MODULE_VERSION,
  });

  const origin = bundlerOrigin();
  if (origin !== null) dialBundler(`${origin.replace(/^http/, 'ws')}${BUNDLER_LINE_PATH}`);
}

export function __resetForTests(): void {
  hasStarted = false;
}
