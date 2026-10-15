import {
  NetworkMocks,
  NetworkRule,
  NO_NETWORK_MOCKS,
  RequestAnswer,
  RequestMatcher,
} from './networkDeclaration';

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
}

/** What the rules in effect say about one request. */
export type Verdict =
  | { kind: 'answer'; answer: RequestAnswer }
  | { kind: 'passthrough' }
  | { kind: 'refusal'; refusal: UnmockedRequestError };

/** How a refusal is told to whoever is keeping the story's record. */
export type RecordRefusal = (refusal: UnmockedRequestError) => void;

let mocksInEffect: NetworkMocks = NO_NETWORK_MOCKS;
let recordRefusal: RecordRefusal = () => {};

/** Put `mocks` in effect, replacing whatever was in effect before. */
export function setNetworkMocks(mocks: NetworkMocks, recordTheRefusal: RecordRefusal): void {
  mocksInEffect = mocks;
  recordRefusal = recordTheRefusal;
}

/** What the rules in effect say about `request` - and, when they refuse it, who is told. */
export function answerFor(request: MockedRequest): Verdict {
  const rule = mocksInEffect.rules.find((candidate) => matches(candidate, request));
  if (rule) return { kind: 'answer', answer: rule.answer };

  if (mocksInEffect.passthrough) return { kind: 'passthrough' };

  const refusal = new UnmockedRequestError(`no mock rule matches ${request.method} ${request.url}`);
  recordRefusal(refusal);
  return { kind: 'refusal', refusal };
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
  if (pattern.endsWith('*')) return url.startsWith(pattern.slice(0, -1));
  return url === pattern;
}

/** The GraphQL operation a request body names, or nothing when the body names none. */
function operationNameOf(body: string | undefined): string | undefined {
  if (body === undefined) return undefined;

  try {
    const parsed = JSON.parse(body) as { operationName?: unknown };
    return typeof parsed?.operationName === 'string' ? parsed.operationName : undefined;
  } catch (_) {
    return undefined;
  }
}
