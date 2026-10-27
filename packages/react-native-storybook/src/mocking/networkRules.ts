import {
  NetworkMocks,
  NetworkRule,
  NO_NETWORK_MOCKS,
  RequestAnswer,
  RequestMatcher,
  SocketAnswer,
  SocketRule,
} from './networkDeclaration';
import { bodyExcerptOf, graphqlOperationOf, operationNameOf } from './networkRequestText';
import { graphqlAnswerFindings } from './graphqlAnswerCheck';
import type { AnswerFinding, UnansweredRequest } from '../sealedCore/seam';

/**
 * THE RULES IN EFFECT, AND WHAT THEY SAY ABOUT ONE REQUEST.
 *
 * The fetch wrapper and the XMLHttpRequest wrapper both come here and nowhere else: they read the
 * rules through `answerFor` on EVERY request rather than holding a copy from the moment they were
 * installed, which is why switching stories replaces the rules without reinstalling anything.
 *
 * Nothing here knows about stories - only about the rules that are in effect.
 */

/** What a request no rule matches is refused with, in a story that did not ask for passthrough. */
export class UnmockedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnmockedRequestError';
  }
}

/** One request, as much of it as a rule can be about. */
export interface MockedRequest {
  /** Upper case, so a matcher's method may be written either way. */
  method: string;
  url: string;
  /** The request body when it is text, which is what a GraphQL operation name is read from. */
  body?: string;
  /** The content-type header the request was sent with, when it set one. */
  contentType?: string;
}

/** What the rules in effect say about one request. */
export type Verdict =
  | { kind: 'answer'; answer: RequestAnswer }
  | { kind: 'passthrough' }
  | { kind: 'held' }
  | { kind: 'refusal'; refusal: UnmockedRequestError };

/** How a refusal is told to whoever is keeping the story's record. */
export type RecordRefusal = (refusal: UnmockedRequestError) => void;

/**
 * What becomes of a WebSocket the app opens:
 * - 'untouched': no story's mocks are in effect; it is the app's own socket, listed nowhere.
 * - 'listed': a capture's story that declared no network mock; it reaches the network, listed.
 * - 'held': a story declared network mocks; a socket rule answers it, or it is refused.
 */
export type SocketPolicy = 'untouched' | 'listed' | 'held';

/** What a WebSocket being opened gets. */
export type SocketVerdict =
  | { kind: 'answer'; answer: SocketAnswer }
  | { kind: 'real' }
  | { kind: 'refusal'; refusal: UnmockedRequestError };

let mocksInEffect: NetworkMocks = NO_NETWORK_MOCKS;
let socketPolicy: SocketPolicy = 'untouched';
let recordRefusal: RecordRefusal = () => {};

// A discover launch: a request no rule names waits forever, so every request the app makes is listed.
let discover = false;

// Every request no rule answered since the rules in effect were put in, in the order made. The
// story's error keeps only the last refusal; this keeps them all, and the ones let through too.
let unanswered: UnansweredRequest[] = [];

// The requests fetch or XMLHttpRequest let through that native code may tell of again, by method and
// address: each is listed once, by JavaScript, so the first native tell of one is not listed.
let expectedNativeEchoes = new Set<string>();

// What the GraphQL answer check found in the answers the rules in effect gave (./graphqlAnswerCheck).
let answerCheckFindings: AnswerFinding[] = [];

// The rules in effect that answered at least one request or socket since they were put in.
let matchedRules = new Set<NetworkRule | SocketRule>();

/** Turn discover mode on or off; it outlasts the rules put in. */
export function setDiscover(on: boolean): void {
  discover = on;
}

/** Put `mocks` in effect, replacing whatever was in effect before. */
export function setNetworkMocks(
  mocks: NetworkMocks,
  recordTheRefusal: RecordRefusal,
  policyForSockets: SocketPolicy = 'untouched'
): void {
  mocksInEffect = mocks;
  socketPolicy = policyForSockets;
  recordRefusal = recordTheRefusal;
  unanswered = [];
  expectedNativeEchoes = new Set();
  answerCheckFindings = [];
  matchedRules = new Set();
}

/**
 * What the rules in effect say about a WebSocket opened to `url`. A socket no rule matches is
 * listed as method "WS" with its address and nothing it would carry (its messages hold tokens and
 * personal data), and in a story with network mocks it is refused like an unmatched request -
 * `passthrough` lets requests through, never a socket.
 */
export function socketVerdictFor(url: string): SocketVerdict {
  if (socketPolicy === 'untouched') return { kind: 'real' };

  const rule = mocksInEffect.sockets.find(
    (candidate) => candidate.matcher.url === undefined || urlMatches(candidate.matcher.url, url)
  );
  if (rule) {
    matchedRules.add(rule);
    return { kind: 'answer', answer: rule.answer };
  }

  unanswered.push({ method: 'WS', url });
  if (socketPolicy === 'listed') return { kind: 'real' };

  const refusal = new UnmockedRequestError(`no mock rule matches WS ${url}`);
  recordRefusal(refusal);
  return { kind: 'refusal', refusal };
}

/** Every request no rule answered under the rules in effect, in the order made. */
export function unansweredRequests(): UnansweredRequest[] {
  return unanswered.map((request) => ({ ...request }));
}

/** What the faked GraphQL answers given under the rules in effect lack, in the order given. */
export function answerFindings(): AnswerFinding[] {
  return answerCheckFindings.map((finding) => ({ ...finding }));
}

/** How many request rules and socket rules are in effect: the proof that a story's rules went in. */
export function rulesInEffect(): { requests: number; sockets: number } {
  return { requests: mocksInEffect.rules.length, sockets: mocksInEffect.sockets.length };
}

/** The rules in effect that no request or socket matched, each told by what it matches. */
export function unmatchedRules(): string[] {
  return [
    ...mocksInEffect.rules
      .filter((rule) => !matchedRules.has(rule))
      .map(({ matcher: { method, url, operationName } }) =>
        requestWords(method ?? 'ANY', url === undefined ? '*' : String(url), operationName)
      ),
    ...mocksInEffect.sockets
      .filter((rule) => !matchedRules.has(rule))
      .map(({ matcher: { url } }) => `WS ${url === undefined ? '*' : String(url)}`),
  ];
}

/** What the rules in effect say about `request` - and, when they refuse it, who is told. */
export function answerFor(request: MockedRequest): Verdict {
  const rule = mocksInEffect.rules.find((candidate) => matches(candidate, request));
  if (rule) {
    matchedRules.add(rule);
    // A request the app polls is answered again and again: each finding is kept once.
    graphqlAnswerFindings(request.url, request.body, rule.answer.body)
      .filter((found) => !answerCheckFindings.some((kept) => sameFinding(kept, found)))
      .forEach((found) => answerCheckFindings.push(found));
    return { kind: 'answer', answer: rule.answer };
  }

  const verdict = verdictForUnanswered(request);
  // Let through, it reaches native code, which tells JavaScript of it again: that echo is dropped.
  if (verdict.kind === 'passthrough') expectedNativeEchoes.add(echoKeyOf(request));
  return verdict;
}

/**
 * A request native code met that no rule matches, recorded as `verdictForUnanswered` does - unless
 * it is the echo of one fetch or XMLHttpRequest let through and so already listed.
 */
export function verdictForNativeUnanswered(request: MockedRequest): Verdict | undefined {
  if (expectedNativeEchoes.delete(echoKeyOf(request))) return undefined;
  return verdictForUnanswered(request);
}

/** Method and address as native code tells them: no fragment, and a bare host ends in a slash. */
function echoKeyOf({ method, url }: MockedRequest): string {
  const withoutFragment = url.replace(/#.*$/, '');
  return `${method} ${withoutFragment.replace(/^(https?:\/\/[^/?]+)(?=\?|$)/i, '$1/')}`;
}

/**
 * A request no rule answers: listed among the unanswered, then let through, held or refused as the
 * rules in effect say - a refusal told to whoever keeps the story's record. fetch and XMLHttpRequest
 * reach it through `answerFor`; a request native code met and decided itself is recorded by it too.
 */
export function verdictForUnanswered(request: MockedRequest): Verdict {
  unanswered.push(recordOf(request));
  const unmatched = unmatchedRequestVerdict();
  if (unmatched !== 'refusal') return { kind: unmatched };

  const refusal = new UnmockedRequestError(
    `no mock rule matches ${requestWords(request.method, request.url, operationNameOf(request.body))}`
  );
  recordRefusal(refusal);
  return { kind: 'refusal', refusal };
}

/** What a request no rule in effect matches gets: let through, held for good, or refused. */
export function unmatchedRequestVerdict(): 'passthrough' | 'held' | 'refusal' {
  if (mocksInEffect.passthrough) return 'passthrough';
  if (discover) return 'held';
  return 'refusal';
}

/** The answer's status, which is 200 unless the rule said otherwise. */
export function statusOf(answer: RequestAnswer): number {
  return answer.status ?? 200;
}

/**
 * The answer's body as the text a response carries, and the headers that go with it. A body that
 * is not already text is sent as JSON and says so, unless the rule named a content type itself.
 */
export function bodyOf(answer: RequestAnswer): { text: string; headers: Record<string, string> } {
  const declaredHeaders = { ...answer.headers };

  if (answer.body === undefined) return { text: '', headers: declaredHeaders };
  if (typeof answer.body === 'string') return { text: answer.body, headers: declaredHeaders };

  return {
    text: JSON.stringify(answer.body),
    headers: { 'content-type': 'application/json', ...declaredHeaders },
  };
}

/** Wait `ms` (or simply reach the next tick, which is what a request never answered on the spot does). */
export function delay(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function matches(rule: NetworkRule, request: MockedRequest): boolean {
  const { method, url, operationName }: RequestMatcher = rule.matcher;

  if (method !== undefined && method.toUpperCase() !== request.method) return false;
  if (url !== undefined && !urlMatches(url, request.url)) return false;
  if (operationName !== undefined && operationNameOf(request.body) !== operationName) return false;

  return true;
}

function urlMatches(pattern: string | RegExp, url: string): boolean {
  if (pattern instanceof RegExp) return pattern.test(url);
  const prefix = urlPrefixOf(pattern);
  if (prefix !== undefined) return url.startsWith(prefix);
  return url === pattern;
}

/** The start every matching address shares when `pattern` ends in `*`; undefined for an exact address. */
export function urlPrefixOf(pattern: string): string | undefined {
  return pattern.endsWith('*') ? pattern.slice(0, -1) : undefined;
}

/** A request told by method, address and, when it has one, GraphQL operation: how a rule and a refusal name it. */
function requestWords(method: string, url: string, operationName: string | undefined): string {
  return [method, url, operationName].filter((part) => part !== undefined).join(' ');
}

function sameFinding(kept: AnswerFinding, found: AnswerFinding): boolean {
  return kept.kind === found.kind && kept.operation === found.operation && kept.path === found.path;
}

/** The request as the record keeps it: the fields it has, and no field it lacks. */
function recordOf(request: MockedRequest): UnansweredRequest {
  const operation = graphqlOperationOf(request.url, request.body);
  const bodyExcerpt = bodyExcerptOf(request.contentType, request.body);

  return {
    method: request.method,
    url: request.url,
    ...(request.contentType !== undefined && { contentType: request.contentType }),
    ...(operation !== undefined && { operation }),
    ...(bodyExcerpt !== undefined && { bodyExcerpt }),
  };
}
