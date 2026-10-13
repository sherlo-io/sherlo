import { answerFor, bodyOf, delay, MockedRequest, statusOf } from './networkRules';

/**
 * THE FETCH HALF OF THE INTERCEPTOR - one wrapper that asks the rules in effect about every
 * request and builds a real Response out of what they answer.
 */

/** The two things a caller hands fetch: what to ask for, and how to ask for it. */
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

export function mockedFetchOf(realFetch: typeof fetch): typeof fetch {
  const mockedFetch = async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const verdict = answerFor(await requestOf(input, init));

    if (verdict.kind === 'passthrough') return realFetch(input, init);
    if (verdict.kind === 'refusal') throw verdict.refusal;

    const { answer } = verdict;
    await delay(answer.delayMs);

    const { text, headers } = bodyOf(answer);
    return new Response(text, { status: statusOf(answer), headers });
  };

  return mockedFetch as typeof fetch;
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
  };
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
