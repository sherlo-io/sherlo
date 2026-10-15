import { NetworkMocks, NO_NETWORK_MOCKS } from './networkDeclaration';
import { mockedFetchOf } from './networkFetch';
import { mockedXhrOf, XhrClass } from './networkXhr';
import { RecordRefusal, setNetworkMocks } from './networkRules';
import SherloModule from '../SherloModule';

/**
 * WHERE THE RULES MEET THE APP - the one place `fetch` and `XMLHttpRequest` are replaced, and the
 * one place they are put back.
 *
 * The wrappers go in when a story that declares at least one network mock activates, and come out
 * when the mocks are cleared or the next story declares none, so a story with no network mocks
 * runs on the app's own fetch and XMLHttpRequest, untouched. While they are in they read the
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

  setNetworkMocks(mocks, recordRefusal);

  const storyDeclaredNetworkMocks = mocks.rules.length > 0 || mocks.passthrough;
  if (storyDeclaredNetworkMocks) install();
  else restore();
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
