import type { StoryMocks } from './mockDeclaration';

/** The methods a rule may name. A matcher that names none matches whatever method was used. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Which requests a rule answers. Every field a matcher names has to match; a matcher that names
 * nothing matches every request.
 *
 * `url` is either the exact address, an address ending in `*` - which matches every address
 * starting with what comes before it - or a regular expression tested against the address.
 * `operationName` matches a GraphQL request by the `operationName` field of its JSON body.
 */
export interface RequestMatcher {
  method?: HttpMethod;
  url?: string | RegExp;
  operationName?: string;
}

/**
 * What a matching request is answered with. `status` defaults to 200, and a `body` that is not
 * already text is sent as JSON with the content type to say so.
 */
export interface RequestAnswer<Body = unknown> {
  status?: number;
  headers?: Record<string, string>;
  body?: Body;
  /** How long to wait before answering - a slow server, told as a number. */
  delayMs?: number;
}

/** One matcher and the answer it gives. */
export interface NetworkRule {
  matcher: RequestMatcher;
  answer: RequestAnswer;
}

/** Which WebSockets a socket rule answers: `url` is matched the way a request's address is. */
export interface SocketMatcher {
  url?: string | RegExp;
}

/**
 * What a matching WebSocket gets. Neither ever reaches the network.
 *
 * - `'pending'`: the socket stays CONNECTING for good and fires nothing - a server that never
 *   answers. A client waiting to connect simply waits; nothing retries.
 * - `'refuse'`: the socket never opens. On the next tick it fires `error`, then `close` with code
 *   1008 (SOCKET_REFUSED_CODE), the same on every boot.
 */
export type SocketAnswer = 'pending' | 'refuse';

/** One socket matcher and the answer it gives. */
export interface SocketRule {
  matcher: SocketMatcher;
  answer: SocketAnswer;
}

/**
 * One network mock a story hands over: a rule to add, a socket rule to add, or the story's word
 * that a request no rule matches may reach the real network instead of being refused.
 */
export type NetworkMockDeclaration =
  | { kind: 'network'; rule: NetworkRule }
  | { kind: 'network'; socket: SocketRule }
  | { kind: 'network'; passthrough: true };

/** Every network mock one story declared, as the wrappers read them. */
export interface NetworkMocks {
  /** Asked in order: the first rule that matches a request answers it. */
  rules: NetworkRule[];
  /**
   * Whether a request no rule matches reaches the real network instead of being refused. It is
   * about fetch and XMLHttpRequest only: a WebSocket no socket rule matches is always refused.
   */
  passthrough: boolean;
  /** Asked in order: the first socket rule that matches a WebSocket's address answers it. */
  sockets: SocketRule[];
}

/** What a story that declared no network mocks at all has. */
export const NO_NETWORK_MOCKS: NetworkMocks = { rules: [], passthrough: false, sockets: [] };

/**
 * Declare the answer to a request the story's screen makes.
 *
 *   mocks: [mockRequest({ method: 'GET', url: 'https://api.example.com/orders' }, { body: [] })]
 *
 * `Body` types the answer's body and nothing else: a URL says nothing about the shape of what
 * comes back, so nothing is inferred from one.
 */
export function mockRequest<Body = unknown>(
  matcher: RequestMatcher,
  answer: RequestAnswer<Body>
): NetworkMockDeclaration {
  return { kind: 'network', rule: { matcher, answer } };
}

/**
 * Let every request no rule matches reach the real network, for this story only. Without it such
 * a request is refused (see UnmockedRequestError), because a screenshot that quietly depended on
 * a live server is the bug the mock exists to remove.
 */
mockRequest.passthrough = (): NetworkMockDeclaration => ({ kind: 'network', passthrough: true });

/**
 * Declare what a WebSocket the story's screen opens gets, for this story only.
 *
 *   mocks: [mockRequest.socket({ url: 'wss://api.example.com/graphql*' }, 'pending')]
 *
 * In a story with any network mock, every WebSocket is held by Sherlo: one no socket rule matches
 * is refused and listed like an unanswered request, whatever `passthrough` says.
 */
mockRequest.socket = (matcher: SocketMatcher, answer: SocketAnswer): NetworkMockDeclaration => ({
  kind: 'network',
  socket: { matcher, answer },
});

/** The network mocks among `mocks`, in the order they are to be asked. */
export function networkMocksOf(mocks: StoryMocks): NetworkMocks {
  if (!Array.isArray(mocks)) return NO_NETWORK_MOCKS;

  const rules: NetworkRule[] = [];
  const sockets: SocketRule[] = [];
  let passthrough = false;

  mocks.forEach((declaration) => {
    if (declaration.kind !== 'network') return;
    if ('passthrough' in declaration) passthrough = true;
    else if ('socket' in declaration) sockets.push(declaration.socket);
    else rules.push(declaration.rule);
  });

  return { rules, passthrough, sockets };
}
