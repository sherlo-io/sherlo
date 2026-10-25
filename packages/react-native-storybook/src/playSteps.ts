/**
 * A SCENE'S PLAY STEPS: what a member does to reach the screen, played before it is photographed.
 *
 * A scene renders the app's whole root, and some screens have no address: a conversation is reached
 * by tapping a tab, then a row, or by opening a link the app routes. The sealed core calls
 * `playSteps(sceneId)` before the stillness check and writes the record from what it answers.
 *
 * A tap goes through the handlers React Native's responder system calls for a finger: the views on
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
import { Linking } from 'react-native';
import RunnerBridge from './helpers/RunnerBridge';
import SherloModule from './SherloModule';
import { currentAppFiber } from './componentNames';
import type { InspectorDataNode, WalkedFiber } from './sealedCore/seam';
import type { OpenStep, PlayStep, TapTarget } from './scenes';
import { asRule, awaitReady, mocksInstalled, sceneOf } from './storyReady';

/** How long a link waits for the system to take it. */
const STEP_TIMEOUT_MS = 10_000;
/** How long a tap looks for its view: the 5 s the signed terminal text promises. */
const TAP_WAIT_MS = 5_000;
const POLL_MS = 100;
/** How long the finger rests on the view: past a Pressable's press-in delay, short of a long press. */
const PRESS_HOLD_MS = 150;
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
export async function playSteps(sceneId: string): Promise<string[]> {
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
    try {
      if ('tap' in step) {
        const found = await waitForTarget(targetOf(step.tap));
        await pressView(found.fiber, found.frame);
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
    RunnerBridge.log('scene step played', { sceneId, step: index + 1 });
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
  const target = targetOf(step.tap);
  return `tap ${nameOf(target)}${target.index ? ` #${target.index}` : ''}`;
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

/** Where a view sits in the window, in points. */
type Frame = { x: number; y: number; width: number; height: number };
type Found = { fiber: WalkedFiber; frame: Frame | undefined };

/** Poll until the target is on screen and drawn, and answer it. Throws when it never shows. */
async function waitForTarget(target: TapTarget): Promise<Found> {
  if (target.testID === undefined && target.text === undefined && target.label === undefined) {
    throw new Error('a tap names no testID, text or label');
  }
  let waitedMs = 0;
  for (;;) {
    const visible = await visibleMatches(target);
    const found = visible[target.index ?? 0];
    if (found) return found;
    if (waitedMs >= TAP_WAIT_MS) {
      const wanted = target.index ? ` (wanted #${target.index}, ${visible.length} visible)` : '';
      throw new NoVisibleView(
        `no visible view with ${nameOf(target)} after ${TAP_WAIT_MS / 1000} s${wanted}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    waitedMs += POLL_MS;
  }
}

/**
 * The views matching `target` that a finger could reach now, topmost first (then leftmost). Read
 * against the native tree when it can be: a view it does not draw, or whose middle is outside the
 * window, is left out. Without the tree, or the tags that join it to React's views (the old
 * renderer), every rendered match in render order.
 */
async function visibleMatches(target: TapTarget): Promise<Found[]> {
  const root = currentAppFiber();
  const matches = root ? hostViewsMatching(root, target) : [];
  if (matches.length === 0) return [];

  const drawn = await framesDrawnNatively();
  if (!drawn || !matches.some((fiber) => nativeTagOf(fiber) !== undefined)) {
    return matches.map((fiber) => ({ fiber, frame: undefined }));
  }
  const found: Found[] = [];
  for (const fiber of matches) {
    const tag = nativeTagOf(fiber);
    const frame = tag === undefined ? undefined : drawn.frames.get(tag);
    if (frame && middleIsInside(frame, drawn.window)) found.push({ fiber, frame });
  }
  return found.sort((a, b) => a.frame!.y - b.frame!.y || a.frame!.x - b.frame!.x);
}

/** The host views under `root` carrying the target's testID or label, or showing its text. */
function hostViewsMatching(root: WalkedFiber, target: TapTarget): WalkedFiber[] {
  const found: WalkedFiber[] = [];
  const pending: WalkedFiber[] = [root];
  for (let fiber = pending.pop(); fiber; fiber = pending.pop()) {
    if (typeof fiber.type === 'string' && isTarget(fiber, target)) found.push(fiber);
    // Children are pushed last-first so the walk visits them in render order.
    const children: WalkedFiber[] = [];
    for (let child = fiber.child; child; child = child.sibling) children.push(child);
    pending.push(...children.reverse());
  }
  return found;
}

function isTarget(fiber: WalkedFiber, target: TapTarget): boolean {
  if (target.testID !== undefined) return fiber.memoizedProps?.testID === target.testID;
  if (target.label !== undefined) return fiber.memoizedProps?.accessibilityLabel === target.label;
  return fiber.type === 'RCTText' && textOf(fiber).trim() === target.text?.trim();
}

/** The text a host Text view shows: every string rendered under it, in order. */
function textOf(fiber: WalkedFiber): string {
  let text = '';
  const pending: WalkedFiber[] = fiber.child ? [fiber.child] : [];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (node.sibling) pending.push(node.sibling);
    if (typeof node.memoizedProps === 'string' || typeof node.memoizedProps === 'number') {
      text += String(node.memoizedProps);
    } else if (node.child) {
      pending.push(node.child);
    }
  }
  return text;
}

/** A host view's native tag, as the new renderer keeps it (the old renderer's are not read). */
function nativeTagOf(fiber: WalkedFiber): number | undefined {
  const tag = fiber.stateNode?.canonical?.nativeTag;
  return typeof tag === 'number' ? tag : undefined;
}

/**
 * Every view the native tree draws, by tag, with its frame in points, and the window's frame. A view
 * hidden, near-transparent or with no size hides everything under it. Undefined when the tree
 * cannot be read.
 */
async function framesDrawnNatively(): Promise<
  { frames: Map<number, Frame>; window: Frame } | undefined
> {
  let data;
  try {
    data = await SherloModule.getInspectorData();
  } catch (_) {
    // No view tree this time: the rendered matches are used, as for the old renderer.
    return undefined;
  }
  const density = data.density > 0 ? data.density : 1;
  const inPoints = (node: InspectorDataNode): Frame => ({
    x: node.x / density,
    y: node.y / density,
    width: node.width / density,
    height: node.height / density,
  });
  const frames = new Map<number, Frame>();
  const pending = [data.viewHierarchy];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if (!node.isVisible || node.width <= 0 || node.height <= 0) continue;
    frames.set(node.id, inPoints(node));
    pending.push(...(node.children ?? []));
  }
  return { frames, window: inPoints(data.viewHierarchy) };
}

function middleIsInside(frame: Frame, window: Frame): boolean {
  const x = frame.x + frame.width / 2;
  const y = frame.y + frame.height / 2;
  return (
    x >= window.x && x < window.x + window.width && y >= window.y && y < window.y + window.height
  );
}

/* ---- The tap ------------------------------------------------------------------------------- */

/**
 * Tap `fiber` as a finger would: the view that becomes the responder is granted the touch and
 * released after PRESS_HOLD_MS. With no responder on the way to the root, the nearest component
 * above the view that takes an `onPress` is called. Throws when nothing answers.
 */
async function pressView(fiber: WalkedFiber, frame: Frame | undefined): Promise<void> {
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
    await new Promise((resolve) => setTimeout(resolve, PRESS_HOLD_MS));
    timestamp += PRESS_HOLD_MS;
    responder.memoizedProps.onResponderRelease?.(eventFor(responder, 'onResponderRelease'));
    return;
  }
  for (let above: WalkedFiber | null | undefined = fiber; above; above = above.return) {
    const onPress = above.memoizedProps?.onPress;
    if (typeof onPress === 'function') {
      onPress(eventFor(fiber, 'onPress'));
      return;
    }
  }
  throw new Error('nothing at the view answers a tap (no responder and no onPress above it)');
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

/** What handlers are handed as the view: the new renderer's public instance, or the old view. */
function publicInstanceOf(fiber: WalkedFiber): unknown {
  return fiber.stateNode?.canonical?.publicInstance ?? fiber.stateNode;
}

/**
 * A touch event in the shape React Native hands responder handlers, naming its `phase` (the handler
 * it is handed to) as `dispatchConfig.registrationName` does: TouchableOpacity reads it.
 */
function touchEvent(
  target: unknown,
  currentTarget: unknown,
  at: { pageX: number; pageY: number },
  timestamp: number,
  phase: string
): object {
  const touch = { identifier: 0, ...at, locationX: 0, locationY: 0, timestamp, target };
  return {
    nativeEvent: { ...touch, touches: [touch], changedTouches: [touch] },
    target,
    currentTarget,
    timeStamp: timestamp,
    dispatchConfig: { registrationName: phase },
    persist: () => {},
    isPersistent: () => true,
    preventDefault: () => {},
    stopPropagation: () => {},
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false,
  };
}
