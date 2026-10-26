import { NetworkMocks, NO_NETWORK_MOCKS } from './networkDeclaration';
import { mockedFetchOf } from './networkFetch';
import { mockedXhrOf, XhrClass } from './networkXhr';
import { RecordRefusal, setNetworkMocks } from './networkRules';
import { TurboModule, TurboModuleRegistry } from 'react-native';
import { holdNativeSockets, NativeSocketModule } from './networkSocket';
import { isACapture } from './stillReal';
import { isBundlerSocketUrl } from '../bundlerOrigin';
import SherloModule from '../SherloModule';

/**
 * WHERE THE RULES MEET THE APP - the one place `fetch` and `XMLHttpRequest` are replaced, and the
 * one place they are put back.
 *
 * The wrappers go in when a story that declares at least one network mock activates, and come out
 * when the mocks are cleared or the next story declares none, so a story with no network mocks
 * runs on the app's own fetch and XMLHttpRequest, untouched - except in a capture, which wraps
 * them for every story to list the requests no rule answered. While they are in they read the
 * rules per request (see ./networkRules), so switching stories replaces the rules without
 * reinstalling anything.
 */

type NetworkGlobals = {
  fetch: typeof fetch;
  XMLHttpRequest?: XhrClass;
};

/** What was replaced, kept so it can be put back. Null whenever nothing is replaced. */
let realNetwork: NetworkGlobals | null = null;

/**
 * Put one story's network mocks in effect. A story that declares none puts the real fetch and
 * XMLHttpRequest back, which is what makes activation atomic: the story that follows a mocked one
 * never inherits its rules.
 *
 * Guarded exactly as module mocks are (see registry.activateMocks): the app a customer ships
 * reports 'default' mode and is never wrapped, whatever its stories declare.
 */
export function activateNetworkMocks(mocks: NetworkMocks, recordRefusal: RecordRefusal): void {
  const mode = SherloModule.getMode();
  if (mode !== 'testing' && mode !== 'storybook') return;

  holdWebSockets();
  const storyDeclaredNetworkMocks =
    mocks.rules.length > 0 || mocks.passthrough || mocks.sockets.length > 0;

  // Only a capture lists what a story requested: there, a story with no network mock is wrapped
  // too, with every request let through to the real network as before, so each one is listed. A
  // cloud test run reports testing mode too, and is no capture. WebSockets follow the same line:
  // listed and let through there, held by the story's socket rules (or refused) in a story that
  // declared network mocks, the app's own everywhere else.
  if (!storyDeclaredNetworkMocks && isACapture()) {
    setNetworkMocks({ rules: [], passthrough: true, sockets: [] }, recordRefusal, 'listed');
    install();
    return;
  }

  setNetworkMocks(mocks, recordRefusal, storyDeclaredNetworkMocks ? 'held' : 'untouched');
  if (storyDeclaredNetworkMocks) install();
  else restore();
}

/** What puts React Native's own socket calls back, once they are held. The hold stays in. */
let releaseSockets: (() => void) | null = null;

/**
 * Hold React Native's WebSocketModule, so every socket opened asks the rules in effect
 * (./networkSocket) - whichever class opened it and whenever that class was defined. Called at
 * every story's activation; it holds once. With no story's mocks in effect every socket is the
 * real one, so it is safe to leave in.
 *
 * Guarded like every other mock: an app in default mode is never held.
 */
export function holdWebSockets(): void {
  const mode = SherloModule.getMode();
  if (mode !== 'testing' && mode !== 'storybook') return;
  if (releaseSockets) return;

  const nativeSockets = TurboModuleRegistry.get<NativeSocketModule & TurboModule>(
    'WebSocketModule'
  );
  if (!nativeSockets || typeof nativeSockets.connect !== 'function') return;

  releaseSockets = holdNativeSockets(nativeSockets, isBundlerSocketUrl);
}

/** Test-only: put React Native's own socket calls back, as a fresh boot of the JavaScript has them. */
export function __releaseWebSocketsForTests(): void {
  releaseSockets?.();
  releaseSockets = null;
}

/**
 * Sherlo's own fetch, which never goes through a story's rules.
 *
 * The SDK talks to its own bundler while a story is on screen - the capture socket, its log, the
 * letterbox - and none of that is the screen making a request, so no rule is ever about it. It
 * goes to the real fetch, whichever one was in place before the wrapper went in.
 */
export function sherloFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
): Promise<Response> {
  return (realNetwork?.fetch ?? globalThis.fetch)(input, init);
}

/** Put the real fetch and XMLHttpRequest back, and leave no rules in effect. */
export function clearNetworkMocks(): void {
  setNetworkMocks(NO_NETWORK_MOCKS, () => {});
  restore();
}

function install(): void {
  if (realNetwork) return;

  const globals = globalThis as unknown as NetworkGlobals;
  realNetwork = { fetch: globals.fetch, XMLHttpRequest: globals.XMLHttpRequest };

  globals.fetch = mockedFetchOf(realNetwork.fetch);
  // A runtime without XMLHttpRequest has nothing to wrap; fetch alone still answers.
  if (realNetwork.XMLHttpRequest) globals.XMLHttpRequest = mockedXhrOf(realNetwork.XMLHttpRequest);
}

function restore(): void {
  if (!realNetwork) return;

  const globals = globalThis as unknown as NetworkGlobals;
  globals.fetch = realNetwork.fetch;
  if (realNetwork.XMLHttpRequest) globals.XMLHttpRequest = realNetwork.XMLHttpRequest;

  realNetwork = null;
}
