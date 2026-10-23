/**
 * WHEN A STORY IS READY TO PHOTOGRAPH, for a story that says so: `parameters.sherlo.ready`.
 *
 * Native code decides a screen has settled when its pixels hold still across a few screenshots.
 * A story that boots a whole app can hold still half-booted - a splash, a loader, an empty list
 * waiting on its first query - for longer than that check looks. Such a story names a view that is
 * only on screen once the app has arrived, and the SDK holds the stillness check back until that
 * view is there and no request the screen made is still on its way. Then the check runs as ever.
 *
 * The hold sits in the native calls the sealed core is handed (./sealedCore/loadSealedCore), so a
 * capture and a test run both wait the same way, with no change to the core. A story never ready
 * fails the stillness check with one line naming what it waited for: a capture reports it as the
 * story's crash, a run as the story's error.
 *
 * Time here is counted in polls, never read off the clock: a story that mocks the clock freezes
 * `Date.now()` for the whole app, Sherlo's own code included.
 */
import RunnerBridge from './helpers/RunnerBridge';
import { collectAppMetadata } from './appMetadata';
import { requestsInFlight } from './mocking/requestsInFlight';
import { storyLevelsOf } from './mocking/storyMocksOf';
import type { NativeCalls } from './sealedCore/seam';
import type { ReadyRule } from './types/types';

/** How long a story that names no time of its own may take to be ready. */
const DEFAULT_READY_TIMEOUT_MS = 30_000;
const POLL_MS = 100;
/**
 * How long the screen must have made no request before its requests count as done: an app's
 * answer to one request is often the next request, sent a moment later.
 */
const REQUESTS_QUIET_MS = 500;

/** The story about to be photographed, and whether it has already been proven ready. */
let storyToReady: { storyId: string; proven: boolean } | undefined;

/**
 * A story is about to render: its readiness is proven afresh, once, before its first stillness
 * check. Called for every story the SDK installs mocks for (./getStorybook/storyMockActivation).
 */
export function storyAboutToRender(storyId: string): void {
  storyToReady = { storyId, proven: false };
}

/** `native`, with its stillness check held back until the story on screen is ready. */
export function stabilizeOnceReady<Native extends Pick<NativeCalls, 'stabilize'>>(
  native: Native
): Native {
  return {
    ...native,
    stabilize: async (...settings: Parameters<NativeCalls['stabilize']>) => {
      const story = storyToReady;
      const rule = story && !story.proven ? readyRuleOf(story.storyId) : undefined;
      if (story && rule) {
        await waitUntilReady(story.storyId, rule);
        story.proven = true;
      }
      return native.stabilize(...settings);
    },
  };
}

/* ========================================================================== */

/** The story's `ready`, its own over its file's; undefined when neither names one. */
function readyRuleOf(storyId: string): ReadyRule | undefined {
  const levels = storyLevelsOf(storyId);
  const rule = levels?.story.parameters?.sherlo?.ready ?? levels?.meta.parameters?.sherlo?.ready;
  return rule && typeof rule === 'object' ? (rule as ReadyRule) : undefined;
}

async function waitUntilReady(storyId: string, rule: ReadyRule): Promise<void> {
  const testIDs = typeof rule.testID === 'string' ? [rule.testID] : (rule.testID ?? []);
  const timeoutMs = rule.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const watchRequests = rule.requestsIdle !== false;

  let waitedMs = 0;
  // The wait starts as busy: a request the screen sends a moment from now still counts.
  let lastBusyAtMs = 0;
  for (;;) {
    const missing = testIDsMissingFromScreen(testIDs);
    const pending = watchRequests ? requestsInFlight() : [];
    if (pending.length > 0) lastBusyAtMs = waitedMs;
    const requestsDone = !watchRequests || waitedMs - lastBusyAtMs >= REQUESTS_QUIET_MS;

    if (missing.length === 0 && requestsDone) {
      RunnerBridge.log('story ready', { storyId, waitedMs });
      return;
    }
    if (waitedMs >= timeoutMs) {
      throw new Error(notReadyLine(storyId, timeoutMs, missing, pending));
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    waitedMs += POLL_MS;
  }
}

/** The testIDs no view the app draws now carries. */
function testIDsMissingFromScreen(testIDs: string[]): string[] {
  const metadata = collectAppMetadata();
  // The current generation only: a view the renderer has since replaced is not on screen.
  const viewProps = metadata?.generations?.[0]?.viewProps ?? metadata?.viewProps ?? {};
  const onScreen = new Set(Object.values(viewProps).map((view) => view.testID));
  return testIDs.filter((testID) => !onScreen.has(testID));
}

function notReadyLine(
  storyId: string,
  timeoutMs: number,
  missing: string[],
  pending: { method: string; url: string }[]
): string {
  const reasons = [
    ...missing.map((testID) => `no view on screen has testID "${testID}"`),
    ...(pending.length > 0
      ? [
          `${pending.length} ${pending.length === 1 ? 'request' : 'requests'} still in flight: ` +
            pending.map(({ method, url }) => `${method} ${url}`).join(', '),
        ]
      : []),
  ];
  if (reasons.length === 0) {
    reasons.push(`its requests had not been done for ${REQUESTS_QUIET_MS / 1000} s`);
  }
  return `Story ${storyId} was not ready after ${timeoutMs / 1000} s: ${reasons.join('; ')}.`;
}
