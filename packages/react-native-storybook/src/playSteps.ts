/**
 * A SCENE'S PLAY STEPS: what a member does to reach the screen, played before it is photographed.
 *
 * A scene renders the app's whole root, and some screens have no address: a conversation is reached
 * by tapping a tab, then a row, or by opening a link the app routes. The sealed core calls
 * `playSteps(sceneId)` before the stillness check and writes the record from what it answers.
 *
 * A tap is a real touch: the native module puts one at the middle of the view's frame (ios and
 * android TouchHelper), so every recognizer a finger reaches sees it - React Native's own and
 * gesture-handler's alike. Where there is no such touch (the old renderer, whose views carry no
 * native tag, so no frame is read; a native build from before the touch) the
 * tap goes through the handlers React Native's responder system calls for a finger: the views on
 * the way to the root are asked to become the responder (capture from the root down, then bubbling
 * up from the view), and the one that accepts is granted the touch and released a moment later. A
 * Pressable, a Touchable or a TextInput answers that as it answers a finger - press in, its delay,
 * press out, `onPress`. A view no responder answers for (a gesture-handler button) is tapped
 * through the nearest component above it that takes an `onPress`.
 *
 * A tap waits for its view to be on screen and drawn - read from the native view tree - and taps
 * the topmost match. A step that cannot be played throws a SherloStepError naming the step, so the
 * capture reports it and never a silent picture of the wrong screen.
 *
 * Time here is counted in polls, never read off the clock: a scene may freeze `Date.now()`.
 */
import { Linking, Platform } from 'react-native';
import { logTheLine } from './connection/appLine';
import SherloModule from './SherloModule';
import { currentAppFiber } from './componentNames';
import type { WalkedFiber } from './sealedCore/seam';
import type { OpenStep, PlayStep, TapTarget } from './scenes';
import { coverOf, nativeTagOf, publicInstanceOf, touchEvent, UNDER_BARS_REASON } from './tapReach';
import type { Frame } from './tapReach';
import { isTarget, visibleViews } from './visibleViews';
import type { Found } from './visibleViews';
import { asRule, awaitReady, mocksInstalled, sceneOf, stepsBeganFor } from './storyReady';

/** How long a link waits for the system to take it. */
const STEP_TIMEOUT_MS = 10_000;
/** How long a tap looks for its view: the 5 s the signed terminal text promises. */
const TAP_WAIT_MS = 5_000;
const POLL_MS = 100;
/** How long the finger rests on the view: past a Pressable's press-in delay, short of a long press. */
const PRESS_HOLD_MS = 150;
/** How long the finger rests for a long-press: past a Pressable's 500 ms long-press delay. */
const LONG_PRESS_HOLD_MS = 800;
/** How long a link has to reach the app's navigation (a `url` event is native code's, a tick later). */
const LINK_SETTLE_MS = 300;

/**
 * A step that could not be played. `step` names it, `played` lists the steps played before it, in
 * order, so the record can say how far the scene got.
 */
export class SherloStepError extends Error {
  constructor(
    sceneId: string,
    readonly step: string,
    reason: string,
    readonly played: string[],
    /** True when the step was a tap whose view never showed within its limit. */
    readonly viewNeverShowed = false
  ) {
    super(`Scene ${sceneId} could not play ${step}: ${reason}`);
    this.name = 'SherloStepError';
  }
}

/** A tap's view that never showed on screen: the one failure the sealed core records as missing. */
class NoVisibleView extends Error {}

/** How long a tap looks for its view, in ms: the limit the record names for a missing step. */
export const TAP_LOOKS_FOR_MS = TAP_WAIT_MS;

/**
 * Play the steps of scene `sceneId` in order, once its mocks are installed. Answers the steps
 * played, each as the words that name it (`tap testID "Connections"`). Throws a SherloStepError for
 * the first step that cannot be played, carrying the steps that did play.
 */
export async function playSteps(
  sceneId: string,
  /** Called before each step after the first, with the count of steps played and of all steps. */
  beforeStep?: (played: number, of: number) => Promise<void>
): Promise<string[]> {
  stepsBeganFor(sceneId);
  await mocksInstalled();
  const scene = sceneOf(sceneId);
  const steps = scene?.play ?? [];
  const played: string[] = [];
  const fail = (index: number, reason: string, viewNeverShowed = false) =>
    new SherloStepError(
      sceneId,
      `step ${index + 1} of ${steps.length} (${describe(steps[index])})`,
      reason,
      played,
      viewNeverShowed
    );

  // A link the app routes nowhere changes nothing and gives no signal: only a ready view after it
  // reveals that, so an open step with no ready after it is refused before anything is played.
  const unguarded = steps.findIndex(
    (step, index) => 'open' in step && !('ready' in (steps[index + 1] ?? {})) && !scene?.ready
  );
  if (unguarded >= 0) {
    throw fail(unguarded, "needs a ready after it (a ready step, or the scene's ready)");
  }

  for (const [index, step] of steps.entries()) {
    if (index > 0) await beforeStep?.(index, steps.length);
    logTheLine(`scene ${sceneId} step ${index + 1} of ${steps.length} started`);
    try {
      if ('tap' in step) {
        await tapView(
          await waitForTarget(targetOf(step.tap)),
          `scene ${sceneId} step ${index + 1} of ${steps.length}`
        );
      } else if ('longPress' in step) {
        await tapView(
          await waitForTarget(targetOf(step.longPress)),
          `scene ${sceneId} step ${index + 1} of ${steps.length}`,
          LONG_PRESS_HOLD_MS,
          'long-press'
        );
      } else if ('open' in step) {
        await openLink(step);
        if (!('ready' in (steps[index + 1] ?? {}))) await readyOrThrow(scene?.ready);
      } else {
        await readyOrThrow(step.ready);
      }
    } catch (error) {
      throw fail(
        index,
        error instanceof Error ? error.message : String(error),
        error instanceof NoVisibleView
      );
    }
    played.push(describe(step));
    logTheLine(`scene ${sceneId} step ${index + 1} of ${steps.length} done`);
  }
  return played;
}

/** The ready wait of a step: throws the line that says what was missing, if the limit passes. */
async function readyOrThrow(ready: Parameters<typeof asRule>[0]): Promise<void> {
  const ended = await awaitReady(asRule(ready) ?? {});
  if (ended.outcome === 'timed-out') throw new Error(ended.line);
}

/* ========================================================================== */

export function targetOf(tap: string | TapTarget): TapTarget {
  return typeof tap === 'string' ? { testID: tap } : tap;
}

export function nameOf(target: TapTarget): string {
  if (target.testID !== undefined) return `testID "${target.testID}"`;
  if (target.text !== undefined) return `text "${target.text}"`;
  return `label "${target.label}"`;
}

function describe(step: PlayStep): string {
  if ('open' in step) return `open ${step.open}`;
  if ('ready' in step) return 'ready';
  const [verb, named] = 'longPress' in step ? ['long-press', step.longPress] : ['tap', step.tap];
  const target = targetOf(named);
  return `${verb} ${nameOf(target)}${target.index ? ` #${target.index}` : ''}`;
}

/**
 * Open the link as the system does for a member's tap on it: the app is asked to open its own URL,
 * native code hands it back as a `url` event, and the navigation's linking routes it. Throws one
 * line when the system finds no app for the link (a scheme the app does not register).
 */
async function openLink(step: OpenStep): Promise<void> {
  if (typeof step.open !== 'string' || !step.open.includes('://')) {
    throw new Error(`"${step.open}" is not a link (expected scheme://path)`);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tooLate = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`the system did not take the link after ${STEP_TIMEOUT_MS / 1000} s`)),
      STEP_TIMEOUT_MS
    );
  });
  try {
    await Promise.race([Linking.openURL(step.open), tooLate]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`no app takes ${step.open}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
  await new Promise((resolve) => setTimeout(resolve, LINK_SETTLE_MS));
}

/** Poll until the target is on screen and drawn, and answer it. Throws when it never shows. */
async function waitForTarget(target: TapTarget): Promise<Found> {
  if (target.testID === undefined && target.text === undefined && target.label === undefined) {
    throw new Error('a tap names no testID, text or label');
  }
  let waitedMs = 0;
  for (;;) {
    const drawn = await visibleViews((fiber) => isTarget(fiber, target));
    const visible = drawn.filter((view) => view.reach !== 'offScreen');
    const found = visible[target.index ?? 0];
    if (found?.reach === 'underBars') throw new Error(UNDER_BARS_REASON);
    if (found) return found;
    if (waitedMs >= TAP_WAIT_MS) {
      // Views are there and every middle is off screen: a view animating in had its 5 s.
      if (drawn.length > 0 && visible.length === 0) throw new Error(UNDER_BARS_REASON);
      const wanted = target.index ? ` (wanted #${target.index}, ${visible.length} visible)` : '';
      throw new NoVisibleView(
        `no visible view with ${nameOf(target)} after ${TAP_WAIT_MS / 1000} s${wanted}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    waitedMs += POLL_MS;
  }
}

/** The testIDs of the views on screen now: unique, in screen order, the first `limit` and the count of the rest. */
export async function testIDsOnScreen(limit: number): Promise<{ testIDs: string[]; more: number }> {
  const views = await visibleViews((fiber) => typeof fiber.memoizedProps?.testID === 'string');
  const onScreen = views.filter((view) => view.reach !== 'offScreen');
  const unique = [...new Set(onScreen.map((view) => String(view.fiber.memoizedProps?.testID)))];
  return { testIDs: unique.slice(0, limit), more: Math.max(0, unique.length - limit) };
}

/* ---- The tap ------------------------------------------------------------------------------- */

/**
 * Tap the view found: by the native touch at its frame's middle, held PRESS_HOLD_MS, else by the
 * synthetic press (see the top of this file for where that is), which also stands in when the
 * touch landed inside the target and no React recognizer took it. Throws when the touch hit
 * another view, or when this iOS lacks the private calls the touch is made of.
 */
async function tapView(
  { fiber, frame }: Found,
  stage: string,
  holdMs = PRESS_HOLD_MS,
  verb: 'tap' | 'long-press' = 'tap'
): Promise<void> {
  const x = frame ? frame.x + frame.width / 2 : 0;
  const y = frame ? frame.y + frame.height / 2 : 0;
  const touched = frame ? await SherloModule.tap(x, y, holdMs) : null;
  // One line per tap step, written where the step ends: the path it took, the point, the target's
  // native tag and, when the native touch answered, what it hit.
  const logTap = (path: string) =>
    logTheLine(
      `${stage} ${verb} by ${path} at ${x},${y} target ${nativeTagOf(fiber)}` +
        (touched
          ? ` hitClass ${touched.hitClass} hitTag ${touched.hitTag} reachedReact ${touched.reachedReact}`
          : '')
    );
  if (!touched) return logTap(await pressView(fiber, frame, holdMs, verb));
  if (touched.missing.length > 0) {
    logTap('native touch');
    throw new Error(
      `Sherlo cannot ${verb} on iOS ${Platform.Version} yet. Update Sherlo, or report it to Sherlo if the newest Sherlo still says this`
    );
  }
  const cover = coverOf(currentAppFiber(), nativeTagOf(fiber), touched);
  if (cover) {
    logTap('native touch');
    const covering =
      cover.testID !== undefined ? nameOf({ testID: cover.testID }) : cover.className;
    throw new Error(
      `the target is covered by ${covering}, so the ${verb} never reached it. Wait for the cover to close, or close it with a tap step before this one`
    );
  }
  // The touch landed inside the target and no React recognizer took it (a native control, say):
  // nothing covers the target, so the synthetic press stands in.
  logTap(touched.reachedReact ? 'native touch' : await pressView(fiber, frame, holdMs, verb));
}

/**
 * The synthetic press of `fiber`: the view that becomes the responder is granted the touch and
 * released after PRESS_HOLD_MS. With no responder on the way to the root, the nearest component
 * above the view that takes an `onPress` is called. Says which of the two answered, and throws
 * when nothing does.
 */
async function pressView(
  fiber: WalkedFiber,
  frame: Frame | undefined,
  holdMs = PRESS_HOLD_MS,
  verb: 'tap' | 'long-press' = 'tap'
): Promise<'synthetic press' | 'the nearest onPress' | 'the nearest onLongPress'> {
  const handler = verb === 'tap' ? 'onPress' : 'onLongPress';
  const path: WalkedFiber[] = [];
  for (let node: WalkedFiber | null | undefined = fiber; node; node = node.return) {
    if (typeof node.type === 'string' && node.memoizedProps) path.push(node);
  }
  const at = frame
    ? { pageX: frame.x + frame.width / 2, pageY: frame.y + frame.height / 2 }
    : { pageX: 0, pageY: 0 };
  const touched = publicInstanceOf(fiber);
  let timestamp = 0;
  const eventFor = (responder: WalkedFiber | undefined, phase: string) =>
    touchEvent(touched, responder && publicInstanceOf(responder), at, timestamp, phase);

  const responder = findResponder(path, eventFor);
  if (responder) {
    responder.memoizedProps.onResponderGrant?.(eventFor(responder, 'onResponderGrant'));
    await new Promise((resolve) => setTimeout(resolve, holdMs));
    timestamp += holdMs;
    responder.memoizedProps.onResponderRelease?.(eventFor(responder, 'onResponderRelease'));
    return 'synthetic press';
  }
  for (let above: WalkedFiber | null | undefined = fiber; above; above = above.return) {
    const onHandler = above.memoizedProps?.[handler];
    if (typeof onHandler === 'function') {
      onHandler(eventFor(fiber, handler));
      return verb === 'tap' ? 'the nearest onPress' : 'the nearest onLongPress';
    }
  }
  throw new Error(
    `nothing at the view answers a ${verb} (no responder and no ${handler} above it)`
  );
}

/**
 * The view that takes the touch, as React Native's responder system picks it: any view asking
 * during the capture phase, from the root down, else the first view asking as the start bubbles up
 * from the touched view.
 */
function findResponder(
  path: WalkedFiber[],
  eventFor: (responder: WalkedFiber, phase: string) => object
): WalkedFiber | undefined {
  const asks = (fiber: WalkedFiber, handler: string): boolean => {
    const ask = fiber.memoizedProps?.[handler];
    return typeof ask === 'function' && ask(eventFor(fiber, handler)) === true;
  };
  const capturing = [...path]
    .reverse()
    .find((fiber) => asks(fiber, 'onStartShouldSetResponderCapture'));
  return capturing ?? path.find((fiber) => asks(fiber, 'onStartShouldSetResponder'));
}
