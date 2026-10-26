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
 *
 * One message goes out before this file runs: when the app's JavaScript dies as it starts, before
 * the Storybook drew, the bundle's polyfill (../../metro/polyfill.js) says `start-failed` over the
 * same socket, dialing the same address first the way `startTheLine` does, since native code dials
 * only once.
 *
 * On a bundler's line the app also waits for `sherlo open` and `sherlo capture`: those waits and
 * their answers are typed beside the line's server half (../../metro/sherloLine.d.ts).
 */
import { NativeEventEmitter, NativeModules } from 'react-native';
import type {
  MessageFromTheAppToTheLine,
  MessageFromTheLineToTheApp,
} from '../../metro/sherloLine';
import { bundlerOrigin } from '../bundlerOrigin';
import { BUNDLER_LINE_PATH } from '../constants';
import { JS_MODULE_VERSION } from '../sdk-compatibility.json';
import { SHERLO_PROTOCOL_VERSION } from '../sealedCore/seam';
import SherloModule from '../SherloModule';
import TurboModule from '../specs/NativeSherloModule';

/** The event native code raises for each message the connection brings, with its JSON. */
const MESSAGE_EVENT = 'SherloMessage';

const nativeModule = TurboModule ?? NativeModules.SherloModule ?? null;

let hasStarted = false;

/**
 * One line in the phone's log about the bundler's line, so a capture that finds no app can be told
 * from the log: it holds the address, an action name or a wait's length, never a message body.
 */
export function logTheLine(what: string): void {
  const line = `@sherlo/react-native-storybook: the bundler line ${what}`;
  console.log(line);
  // React Native 0.77 and later no longer stream console.log to the bundler, so the line also goes
  // over the connection as a log message, where the capture reads it. Native code queues a send
  // until its hello, and `send` drops one only when the native calls are absent. Only a testing
  // run sends it, as RunnerBridge.log does: an app outside one sends nothing but its hello.
  if (SherloModule.getMode() === 'testing') send({ action: 'log', line });
}

/** Send one message over the connection. */
export function send(message: MessageFromTheAppToTheLine): void {
  if (typeof nativeModule?.sendMessage !== 'function') return;
  nativeModule.sendMessage(JSON.stringify(message));
}

/** Hear every message the connection brings from now on; the answer stops hearing them. */
export function onMessage(listener: (message: MessageFromTheLineToTheApp) => void): () => void {
  if (typeof nativeModule?.sendMessage !== 'function') return () => {};

  const subscription = new NativeEventEmitter(nativeModule).addListener(
    MESSAGE_EVENT,
    (messageJson: string) => listener(JSON.parse(messageJson) as MessageFromTheLineToTheApp)
  );
  return () => subscription.remove();
}

/**
 * Send one wait over the connection, and resolve with the first message of `answerAction` the
 * connection brings back, without its action. Rejects when none came within `timeoutMs`: the road
 * itself is gone, rather than there simply being nothing to hand over, since the line answers every
 * wait sooner.
 */
export function sendAndAwaitAnswer<AnswerAction extends MessageFromTheLineToTheApp['action']>(
  message: MessageFromTheAppToTheLine,
  answerAction: AnswerAction,
  timeoutMs: number
): Promise<Omit<Extract<MessageFromTheLineToTheApp, { action: AnswerAction }>, 'action'>> {
  return new Promise((resolve, reject) => {
    const giveUp = setTimeout(() => {
      stopListening();
      logTheLine(`brought no ${answerAction} within ${timeoutMs}ms`);
      reject(new Error(`Sherlo's line brought no ${answerAction} within ${timeoutMs}ms`));
    }, timeoutMs);

    // Listen before sending, so an answer that comes back at once is not missed.
    const stopListening = onMessage((heard) => {
      if (heard.action !== answerAction) return;
      clearTimeout(giveUp);
      stopListening();
      const { action: _action, ...answer } = heard as Extract<
        MessageFromTheLineToTheApp,
        { action: AnswerAction }
      >;
      resolve(answer);
    });
    send(message);
  });
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
  logTheLine('sent its hello');

  const origin = bundlerOrigin();
  if (origin === null) return;
  const address = `${origin.replace(/^http/, 'ws')}${BUNDLER_LINE_PATH}`;
  logTheLine(`dials ${address}`);
  dialBundler(address);
  const stopWaitingForAnAnswer = onMessage((heard) => {
    stopWaitingForAnAnswer();
    logTheLine(`answered: ${heard.action}`);
  });
}

export function __resetForTests(): void {
  hasStarted = false;
}
