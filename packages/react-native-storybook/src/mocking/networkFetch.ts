import {
  answerFor,
  bodyOf,
  delay,
  letThroughByFetch,
  MockedRequest,
  statusOf,
} from './networkRules';
import { requestStarted } from './requestsInFlight';

/**
 * THE FETCH HALF OF THE INTERCEPTOR - one wrapper that asks the rules in effect about every
 * request and builds a real Response out of what they answer.
 */

/** The two things a caller hands fetch: what to ask for, and how to ask for it. */
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

export function mockedFetchOf(realFetch: typeof fetch): typeof fetch {
  const mockedFetch = async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const request = await requestOf(input, init);
    // In flight from here until it is answered, however it is answered (./requestsInFlight).
    const ended = requestStarted(request);
    try {
      const verdict = answerFor(request);

      if (verdict.kind === 'passthrough') {
        return await letThroughByFetch(() => realFetch(input, init));
      }
      if (verdict.kind === 'refusal') throw verdict.refusal;
      if (verdict.kind === 'held') return await heldUntilAborted(init?.signal);

      const { answer } = verdict;
      await delay(answer.delayMs);

      const { text, headers } = bodyOf(answer);
      return new Response(text, { status: statusOf(answer), headers });
    } finally {
      ended();
    }
  };

  return mockedFetch as typeof fetch;
}

/** A request that is never answered; an abort signal still ends it, as it ends a real one. */
function heldUntilAborted(signal: NonNullable<FetchInit>['signal']): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    if (!signal) return;
    const abort = () => {
      const aborted = new Error('The operation was aborted.');
      aborted.name = 'AbortError';
      reject(aborted);
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

/** The one request the caller is making, however it spelled it out. */
async function requestOf(input: FetchInput, init?: FetchInit): Promise<MockedRequest> {
  // fetch takes the address as a string, a URL, or a whole Request carrying its own method and
  // body - which is the only form whose body has to be read back out of it.
  const asRequest = isRequest(input) ? input : undefined;

  return {
    method: (init?.method ?? asRequest?.method ?? 'GET').toUpperCase(),
    url: asRequest ? asRequest.url : String(input),
    body: typeof init?.body === 'string' ? init.body : await bodyTextOf(asRequest),
    contentType: contentTypeOf(init?.headers ?? asRequest?.headers),
  };
}

function contentTypeOf(
  headers: ConstructorParameters<typeof Headers>[0] | undefined
): string | undefined {
  if (!headers) return undefined;

  try {
    return new Headers(headers).get('content-type') ?? undefined;
  } catch (_) {
    // A runtime whose Headers cannot read this shape: the request has no content type to record.
    return undefined;
  }
}

function isRequest(input: FetchInput): input is Request {
  return typeof input === 'object' && input !== null && 'url' in input;
}

async function bodyTextOf(request: Request | undefined): Promise<string | undefined> {
  if (!request || typeof request.clone !== 'function') return undefined;

  // The clone is what leaves the caller's own Request still readable by whoever gets it next.
  return request
    .clone()
    .text()
    .catch(() => undefined);
}
