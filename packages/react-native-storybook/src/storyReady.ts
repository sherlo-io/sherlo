/**
 * WHEN A SCENE IS READY TO PHOTOGRAPH: the `ready` of a scene (./scenes).
 *
 * Native code decides a screen has settled when its pixels hold still across a few screenshots.
 * An app that boots to a scene can hold still half-booted - a splash, a loader, an empty list
 * waiting on its first query - for longer than that check looks. A scene names a view that is only
 * on screen once the app has arrived, and the SDK holds the stillness check back until that view is
 * there, every view the scene says must be gone has left (not in the view tree, or invisible), and
 * no request the screen made is still on its way. Then the check runs as ever.
 *
 * A scene loads no Storybook. A view named by testID is judged by the native view tree
 * (SherloModule.getViewVisibility). A view named by its text or label is found as a tap step finds
 * its target (./visibleViews) and counts once it is drawn on screen.
 *
 * The hold sits in the native calls the sealed core is handed (./sealedCore/loadSealedCore), so a
 * capture and a test run both wait the same way, with no change to the core. A scene never ready
 * fails the stillness check with one line naming what it waited for: a capture reports it as the
 * scene's crash. An error the app threw while waiting is reported instead of that line.
 *
 * Time here is counted in polls, never read off the clock: a scene that mocks the clock freezes
 * `Date.now()` for the whole app, Sherlo's own code included.
 */
import RunnerBridge from './helpers/RunnerBridge';
import SherloModule from './SherloModule';
import bundledScenes from './bundledScenes';
import { requestsInFlight } from './mocking/requestsInFlight';
import { readStoryError, recordStoryError } from './getStorybook/storyErrorRegistry';
import { markStorySettled } from './mocking/registry';
import type { NativeCalls } from './sealedCore/seam';
import { reachedRoute } from './reachedScreen';
import { isDrawn } from './visibleViews';
import type { Scene, SceneFile } from './scenes';
import type { ReadyRule, ViewVisibility } from './types/types';

/** How long a scene that names no time of its own may take to be ready. */
const DEFAULT_READY_TIMEOUT_MS = 30_000;
const POLL_MS = 100;
/**
 * How long the screen must have made no request before its requests count as done: an app's
 * answer to one request is often the next request, sent a moment later.
 */
const REQUESTS_QUIET_MS = 500;

/**
 * How a wait ended. `shown`: the views the rule names are on screen (and any it names as gone have
 * left). `gone`: the rule only named views that had to leave, and they have. `timed-out`: the
 * limit passed; `line` says what was missing and `route` is the screen the app stayed on, as far as
 * the app's navigation state can say (empty when it cannot).
 */
export type ReadyOutcome =
  | { outcome: 'shown' }
  | { outcome: 'gone' }
  | { outcome: 'timed-out'; route: string[]; line: string };

type ReadVisibility = (testIDs: string[]) => Promise<ViewVisibility>;

/**
 * The scene about to be photographed, whether it has already been proven ready, and the promise
 * that settles once its mocks are installed (null when they already are).
 */
let sceneToReady: { sceneId: string; proven: boolean; installed: Promise<void> | null } | undefined;

/**
 * A scene is about to be photographed: its readiness is proven afresh, once, before its first
 * stillness check. Called for every scene the SDK installs mocks for
 * (./getStorybook/storyMockActivation), with the promise that installing them returned.
 */
export function storyAboutToRender(sceneId: string, installed: Promise<void> | null = null): void {
  sceneToReady = { sceneId, proven: false, installed };
}

/**
 * Settles once the mocks of the scene about to be photographed are installed. Whatever acts on the
 * scene's screen - its steps, its stillness check - waits here first: a step pressed while a mock
 * is still going on reads the real module, or presses a screen that is not yet the scene's. An
 * install that failed is the scene's error (./getStorybook/storyErrorRegistry), not this wait's.
 */
export async function mocksInstalled(): Promise<void> {
  await sceneToReady?.installed?.catch(() => undefined);
}

/**
 * A capture of the scene on screen is over (the core clears its mocks, ./sealedCore/loadSealedCore):
 * the next capture proves it ready again. A capture of the scene already on screen activates
 * nothing, and each capture is a photograph of its own - the screen and its requests may have
 * moved since. Only the parts of one tall scene share one proof.
 */
export function proveReadyAgain(): void {
  if (sceneToReady) sceneToReady.proven = false;
}

/**
 * Wait until `rule` holds, for a scene file that wants to know. Resolves how the wait ended, and
 * throws what the app threw while it waited, which beats a ready failure.
 */
export async function awaitReady(rule: string | ReadyRule): Promise<ReadyOutcome> {
  const ended = await waitUntilReady(
    sceneToReady?.sceneId,
    asRule(rule),
    SherloModule.getViewVisibility
  );
  if (ended === 'errored') throw errorOfTheScene(sceneToReady?.sceneId);
  return ended;
}

/** `native`, with its stillness check held back until the scene on screen is ready. */
export function stabilizeOnceReady<
  Native extends Pick<NativeCalls, 'stabilize'> & { getViewVisibility?: ReadVisibility },
>(native: Native): Native {
  return {
    ...native,
    stabilize: async (...settings: Parameters<NativeCalls['stabilize']>) => {
      // The scene's mocks are in before anything judges its screen (a scene whose mocks were still
      // installing was photographed with its steps skipped).
      await mocksInstalled();
      const scene = sceneToReady;
      const rule = scene && !scene.proven ? readyRuleOf(scene.sceneId) : undefined;
      if (scene && rule) {
        const ended = await waitUntilReady(scene.sceneId, rule, native.getViewVisibility);
        // An error ends the wait and the stillness check runs, so the scene reports its own error.
        if (ended !== 'errored' && ended.outcome === 'timed-out') throw new Error(ended.line);
        scene.proven = true;
      }
      try {
        return await native.stabilize(...settings);
      } finally {
        // The screen is judged: every read the scene's render makes is in (./mocking/activateStoryMocks).
        markStorySettled();
      }
    },
  };
}

/* ========================================================================== */

/** What a scene file declared for the scene `sceneId`; undefined for a scene the bundle lacks. */
export function sceneOf(sceneId: string): Scene | undefined {
  const scene = bundledScenes[sceneId];
  if (!scene) return undefined;
  const file = (scene.loadFile() as { default?: SceneFile } | undefined)?.default;
  return file?.scenes[scene.sceneName];
}

/** A `ready` as a rule: a bare string names the one view that must be on screen. */
export function asRule(ready: string | ReadyRule): ReadyRule;
export function asRule(ready: string | ReadyRule | undefined): ReadyRule | undefined;
export function asRule(ready: string | ReadyRule | undefined): ReadyRule | undefined {
  if (typeof ready === 'string') return { testID: ready };
  return ready && typeof ready === 'object' ? ready : undefined;
}

/** The scene's `ready`, as a rule; undefined when the scene names none. */
export function readyRuleOf(sceneId: string): ReadyRule | undefined {
  return asRule(sceneOf(sceneId)?.ready);
}

/** A name or a list of names, as a list. */
function listOf(names: string | string[] | undefined): string[] {
  return typeof names === 'string' ? [names] : (names ?? []);
}

async function waitUntilReady(
  sceneId: string | undefined,
  rule: ReadyRule,
  readVisibility: ReadVisibility | undefined
): Promise<ReadyOutcome | 'errored'> {
  const testIDs = listOf(rule.testID);
  const goneIDs = listOf(rule.gone);
  const texts = listOf(rule.text);
  const labels = listOf(rule.label);
  const timeoutMs = rule.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const watchRequests = rule.requestsIdle !== false;

  let waitedMs = 0;
  // The wait starts as busy: a request the screen sends a moment from now still counts.
  let lastBusyAtMs = 0;
  for (;;) {
    // A scene that threw (or whose mock or request failed it) will never show its views: end the
    // wait at once, so the scene's own error is reported, as it is for a scene with no `ready`.
    if (sceneId && endedByTheScenesError(sceneId, waitedMs)) return 'errored';
    const views = await viewsOnScreen([...testIDs, ...goneIDs], readVisibility);
    const pending = watchRequests ? requestsInFlight() : [];
    if (pending.length > 0) lastBusyAtMs = waitedMs;
    const requestsDone = !watchRequests || waitedMs - lastBusyAtMs >= REQUESTS_QUIET_MS;

    const notShown = views ? testIDs.filter((testID) => views[testID] !== 'visible') : testIDs;
    const showing = views ? goneIDs.filter((testID) => views[testID] === 'visible') : goneIDs;

    const unseen = {
      texts: await notDrawn(texts, (text) => ({ text })),
      labels: await notDrawn(labels, (label) => ({ label })),
    };
    const namesViewToShow = testIDs.length + texts.length + labels.length > 0;

    if (
      views &&
      notShown.length === 0 &&
      showing.length === 0 &&
      unseen.texts.length === 0 &&
      unseen.labels.length === 0 &&
      requestsDone
    ) {
      RunnerBridge.log('story ready', { storyId: sceneId, waitedMs });
      return { outcome: !namesViewToShow && goneIDs.length > 0 ? 'gone' : 'shown' };
    }
    if (waitedMs >= timeoutMs) {
      // The wait ran out: the screen is judged as it is, so a declared mock the app never read now
      // counts - and it, like any throw, is what the scene reports rather than the timeout.
      markStorySettled();
      if (sceneId && endedByTheScenesError(sceneId, waitedMs)) return 'errored';
      const line = notReadyLine(sceneId, timeoutMs, {
        views,
        testIDs,
        goneIDs,
        unseen,
        pending,
      });
      return { outcome: 'timed-out', route: reachedRoute(), line };
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    waitedMs += POLL_MS;
  }
}

/** The names, of those given, that no view on screen answers to. */
async function notDrawn(
  names: string[],
  asTarget: (name: string) => { text: string } | { label: string }
): Promise<string[]> {
  const unseen: string[] = [];
  for (const name of names) {
    if (!(await isDrawn(asTarget(name)))) unseen.push(name);
  }
  return unseen;
}

/** What the native view tree says of each view; undefined when it cannot be read. */
async function viewsOnScreen(
  testIDs: string[],
  readVisibility: ReadVisibility | undefined
): Promise<ViewVisibility | undefined> {
  if (testIDs.length === 0) return {};
  if (!readVisibility) return undefined;
  try {
    return await readVisibility(testIDs);
  } catch {
    return undefined;
  }
}

/**
 * Whether the scene has an error, which then ends its ready wait. The error is kept in the scene's
 * record (./getStorybook/storyErrorRegistry), so the capture reports exactly what ended the wait
 * as what the scene threw - never a log line alone - even when it was a mock failure worked out at
 * this read.
 */
function endedByTheScenesError(sceneId: string, waitedMs: number): boolean {
  const error = readStoryError(sceneId);
  if (!error) return false;
  recordStoryError(sceneId, error);
  RunnerBridge.log('story ready wait ended: the story errored', {
    storyId: sceneId,
    waitedMs,
    error: error.name,
  });
  return true;
}

function errorOfTheScene(sceneId: string | undefined): Error {
  const error = sceneId ? readStoryError(sceneId) : undefined;
  const thrown = new Error(error?.message);
  thrown.name = error?.name ?? 'Error';
  return thrown;
}

function notReadyLine(
  sceneId: string | undefined,
  timeoutMs: number,
  waited: {
    views: ViewVisibility | undefined;
    testIDs: string[];
    goneIDs: string[];
    /** The texts and labels of the rule that no view on screen shows. */
    unseen: { texts: string[]; labels: string[] };
    pending: { method: string; url: string }[];
  }
): string {
  const { views, testIDs, goneIDs, unseen, pending } = waited;
  const reasons: string[] = [];
  if (!views) {
    reasons.push('the native view tree could not be read');
  } else {
    for (const testID of testIDs) {
      if (views[testID] === 'visible') continue;
      reasons.push(
        views[testID] === 'unreached'
          ? `view "${testID}" is past the inspector's depth limit, so it cannot be seen`
          : views[testID] === 'invisible'
            ? `view "${testID}" is on screen but not drawn`
            : `no view on screen has testID "${testID}"`
      );
    }
    for (const testID of goneIDs) {
      if (views[testID] === 'visible') reasons.push(`view "${testID}" is still showing`);
      // Named so a scene that waits on a view the inspector cannot see is not mistaken for ready.
      if (views[testID] === 'unreached') {
        reasons.push(`view "${testID}" is past the inspector's depth limit and was read as gone`);
      }
    }
  }
  for (const text of unseen.texts) reasons.push(`no view on screen shows the text "${text}"`);
  for (const label of unseen.labels) {
    reasons.push(`no view on screen has the accessibility label "${label}"`);
  }
  if (pending.length > 0) {
    reasons.push(
      `${pending.length} ${pending.length === 1 ? 'request' : 'requests'} still in flight: ` +
        pending.map(({ method, url }) => `${method} ${url}`).join(', ')
    );
  }
  if (reasons.length === 0) {
    reasons.push(`its requests had not been done for ${REQUESTS_QUIET_MS / 1000} s`);
  }
  return `Story ${sceneId ?? 'on screen'} was not ready after ${timeoutMs / 1000} s: ${reasons.join('; ')}.`;
}
