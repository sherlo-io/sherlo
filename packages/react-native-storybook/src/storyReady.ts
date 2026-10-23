/**
 * WHEN A STORY IS READY TO PHOTOGRAPH, for a story that says so: `parameters.sherlo.ready`.
 *
 * Native code decides a screen has settled when its pixels hold still across a few screenshots.
 * A story that boots a whole app can hold still half-booted - a splash, a loader, an empty list
 * waiting on its first query - for longer than that check looks. Such a story names a view that is
 * only on screen once the app has arrived, and the SDK holds the stillness check back until that
 * view is there, every view it says must be gone has left (not rendered, or invisible), and no
 * request the screen made is still on its way. Then the check runs as ever.
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
import { appFiberRoots, collectAppMetadata } from './appMetadata';
import { requestsInFlight } from './mocking/requestsInFlight';
import { readStoryError } from './getStorybook/storyErrorRegistry';
import { storyLevelsOf } from './mocking/storyMocksOf';
import type { NativeCalls, WalkedFiber } from './sealedCore/seam';
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
export function stabilizeOnceReady<
  Native extends Pick<NativeCalls, 'stabilize'> & Partial<Pick<NativeCalls, 'getInspectorData'>>,
>(native: Native): Native {
  return {
    ...native,
    stabilize: async (...settings: Parameters<NativeCalls['stabilize']>) => {
      const story = storyToReady;
      const rule = story && !story.proven ? readyRuleOf(story.storyId) : undefined;
      if (story && rule) {
        await waitUntilReady(story.storyId, rule, native.getInspectorData);
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

async function waitUntilReady(
  storyId: string,
  rule: ReadyRule,
  getInspectorData: NativeCalls['getInspectorData'] | undefined
): Promise<void> {
  const testIDs = typeof rule.testID === 'string' ? [rule.testID] : (rule.testID ?? []);
  const goneIDs = typeof rule.gone === 'string' ? [rule.gone] : (rule.gone ?? []);
  const timeoutMs = rule.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const watchRequests = rule.requestsIdle !== false;

  let waitedMs = 0;
  // The wait starts as busy: a request the screen sends a moment from now still counts.
  let lastBusyAtMs = 0;
  for (;;) {
    // A story that threw (or whose mock or request failed it) will never show its views: end the
    // wait at once and let the stillness check run, so the story's own error is reported, as it
    // is for a story with no `ready`.
    if (readStoryError(storyId)) {
      RunnerBridge.log('story ready wait ended: the story errored', { storyId, waitedMs });
      return;
    }
    const missing = testIDsMissingFromScreen(testIDs);
    const showing = await testIDsStillShowing(goneIDs, getInspectorData);
    const pending = watchRequests ? requestsInFlight() : [];
    if (pending.length > 0) lastBusyAtMs = waitedMs;
    const requestsDone = !watchRequests || waitedMs - lastBusyAtMs >= REQUESTS_QUIET_MS;

    if (missing.length === 0 && showing.length === 0 && requestsDone) {
      RunnerBridge.log('story ready', { storyId, waitedMs });
      return;
    }
    if (waitedMs >= timeoutMs) {
      throw new Error(notReadyLine(storyId, timeoutMs, missing, showing, pending));
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

/**
 * The testIDs among `testIDs` whose view is on screen and visible: rendered in the current
 * generation, and drawn - judged by the native view tree the capture records (the same
 * `getInspectorData`); the style React rendered is the fallback when that tree cannot be read.
 */
async function testIDsStillShowing(
  testIDs: string[],
  getInspectorData: NativeCalls['getInspectorData'] | undefined
): Promise<string[]> {
  if (testIDs.length === 0) return [];
  const missing = new Set(testIDsMissingFromScreen(testIDs));
  const rendered = new Set(testIDs.filter((testID) => !missing.has(testID)));
  if (rendered.size === 0) return [];

  const drawn = await testIDsDrawnNatively(rendered, getInspectorData);
  if (drawn) return testIDs.filter((testID) => drawn.has(testID));
  return testIDsVisibleByRenderedStyle(testIDs, rendered);
}

/**
 * Of `testIDs`, those with a view the native tree draws: visible (not hidden, alpha above the
 * inspector's threshold - an animated opacity included), with a width and a height, under
 * ancestors that are too. A view the tree does not reach (off screen, or past its limits) is not
 * drawn. Undefined when the tree cannot be read.
 */
async function testIDsDrawnNatively(
  testIDs: Set<string>,
  getInspectorData: NativeCalls['getInspectorData'] | undefined
): Promise<Set<string> | undefined> {
  if (!getInspectorData) return undefined;
  let tree;
  try {
    tree = (await getInspectorData()).viewHierarchy;
  } catch {
    return undefined;
  }
  const metadata = collectAppMetadata();
  const viewProps = metadata?.generations?.[0]?.viewProps ?? metadata?.viewProps ?? {};
  const testIDOfTag = new Map<number, string>();
  for (const [tag, view] of Object.entries(viewProps)) {
    if (view.testID && testIDs.has(view.testID)) testIDOfTag.set(Number(tag), view.testID);
  }

  const drawn = new Set<string>();
  const pending = [tree];
  for (let node = pending.pop(); node; node = pending.pop()) {
    // A node that is not drawn hides everything under it: its children are never visited.
    if (!node.isVisible || node.width <= 0 || node.height <= 0) continue;
    const testID = testIDOfTag.get(node.id);
    if (testID) drawn.add(testID);
    pending.push(...(node.children ?? []));
  }
  return drawn;
}

function testIDsVisibleByRenderedStyle(testIDs: string[], rendered: Set<string>): string[] {
  const root = currentRoot(appFiberRoots());
  const views = root ? hostViewsWithTestID(root, rendered) : new Map<string, WalkedFiber[]>();
  // A rendered view the walk cannot find is taken as showing: only a style that was seen hides one.
  return testIDs.filter((testID) => {
    if (!rendered.has(testID)) return false;
    const found = views.get(testID) ?? [];
    return found.length === 0 || found.some((view) => !isHidden(view));
  });
}

/** Of a fiber and its alternate, the one React shows now (the first, when it cannot tell). */
function currentRoot(roots: WalkedFiber[]): WalkedFiber | undefined {
  return (
    roots.find((root) => {
      let top = root;
      while (top.return) top = top.return;
      return top.stateNode?.current === top;
    }) ?? roots[0]
  );
}

function hostViewsWithTestID(root: WalkedFiber, testIDs: Set<string>): Map<string, WalkedFiber[]> {
  const found = new Map<string, WalkedFiber[]>();
  const pending: WalkedFiber[] = [root];
  for (let fiber = pending.pop(); fiber; fiber = pending.pop()) {
    const testID = fiber.memoizedProps?.testID;
    if (typeof fiber.type === 'string' && typeof testID === 'string' && testIDs.has(testID)) {
      found.set(testID, [...(found.get(testID) ?? []), fiber]);
    }
    if (fiber.sibling && fiber !== root) pending.push(fiber.sibling);
    if (fiber.child) pending.push(fiber.child);
  }
  return found;
}

/** Whether the view, or a view above it, is drawn at opacity 0 or with no width or height. */
function isHidden(view: WalkedFiber): boolean {
  for (let fiber: WalkedFiber | null | undefined = view; fiber; fiber = fiber.return) {
    if (typeof fiber.type !== 'string') continue;
    const style = flattenStyle(fiber.memoizedProps?.style);
    if (style.opacity === 0 || style.width === 0 || style.height === 0) return true;
  }
  return false;
}

/** A style prop as one object: arrays joined in order, the later winning, falsy entries skipped. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (all, one) => ({ ...all, ...flattenStyle(one) }),
      {}
    );
  }
  return style && typeof style === 'object' ? (style as Record<string, unknown>) : {};
}

function notReadyLine(
  storyId: string,
  timeoutMs: number,
  missing: string[],
  showing: string[],
  pending: { method: string; url: string }[]
): string {
  const reasons = [
    ...missing.map((testID) => `no view on screen has testID "${testID}"`),
    ...showing.map((testID) => `view "${testID}" is still showing`),
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
