import { NetworkMocks, NO_NETWORK_MOCKS } from './networkDeclaration';
import { mockedFetchOf } from './networkFetch';
import { mockedXhrOf, XhrClass } from './networkXhr';
import { RecordRefusal, setNetworkMocks } from './networkRules';
import { mockedWebSocketOf, WebSocketClass } from './networkSocket';
import { isACapture } from './stillReal';
import { bundlerOrigin } from '../bundlerOrigin';
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

/** The real WebSocket class, kept once the wrapper replaced it. The wrapper is never taken out. */
let realWebSocket: WebSocketClass | null = null;

/**
 * Replace the global WebSocket with one that asks the rules in effect (./networkSocket). Called
 * when the SDK is imported, before most of the app's modules capture the class, and again at
 * every story's activation; it replaces it once. With no story's mocks in effect the wrapper
 * builds the real socket, so it is safe to leave in.
 *
 * Guarded like every other mock: an app in default mode is never wrapped.
 */
export function holdWebSockets(): void {
  const mode = SherloModule.getMode();
  if (mode !== 'testing' && mode !== 'storybook') return;
  if (realWebSocket) return;

  const globals = globalThis as unknown as { WebSocket?: WebSocketClass };
  if (typeof globals.WebSocket !== 'function') return;

  realWebSocket = globals.WebSocket;
  globals.WebSocket = mockedWebSocketOf(realWebSocket, isTheBundlersSocket);
}

/** Test-only: put the real WebSocket back, as a fresh boot of the JavaScript has it. */
export function __releaseWebSocketsForTests(): void {
  if (!realWebSocket) return;
  (globalThis as unknown as { WebSocket?: WebSocketClass }).WebSocket = realWebSocket;
  realWebSocket = null;
}

/** A socket to the bundler the app came from (hot reload, its status) is never a story's. */
function isTheBundlersSocket(url: string): boolean {
  const origin = bundlerOrigin();
  if (!origin) return false;
  return /^wss?:\/\/([^/?#]+)/.exec(url)?.[1] === origin.replace(/^https?:\/\//, '');
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
