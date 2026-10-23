/**
 * THE REQUESTS THE SCREEN IS STILL WAITING ON, as the interceptor sees them.
 *
 * Every request that goes through the wrapped fetch or XMLHttpRequest (./networkFetch,
 * ./networkXhr) is counted from the moment it is made until it ends - answered by a rule, refused,
 * or come back from the real network. A scene that declares when it is ready (../storyReady) waits
 * for this list to be empty, so a screen still loading its data is never photographed.
 *
 * Only the wrapped globals are seen: a request made while no wrapper is in, and anything native
 * code fetches by itself (an image view's own download, say), is not on the list. A socket is never
 * on it: a held socket stays connecting by design (./networkSocket).
 */
import type { MockedRequest } from './networkRules';

type RequestInFlight = Pick<MockedRequest, 'method' | 'url'>;

const inFlight = new Set<{ request: RequestInFlight }>();

/** Count `request` as in flight; the answer ends it. Ending it twice ends it once. */
export function requestStarted(request: RequestInFlight): () => void {
  const entry = { request: { method: request.method, url: request.url } };
  inFlight.add(entry);
  return () => {
    inFlight.delete(entry);
  };
}

/** The requests made and not yet ended, oldest first. */
export function requestsInFlight(): RequestInFlight[] {
  return [...inFlight].map((entry) => entry.request);
}

/** Test-only: forget every request, the way a fresh boot has none. */
export function __resetRequestsInFlightForTests(): void {
  inFlight.clear();
}
