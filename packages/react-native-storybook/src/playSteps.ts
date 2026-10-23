/**
 * A STORY'S STEPS: what a member does to reach the screen, played before it is photographed
 * (`parameters.sherlo.steps`).
 *
 * A scene renders the app's whole root, and some screens have no address: a conversation is
 * reached by pressing a tab, then a row. The steps press those views from JavaScript, through the
 * same handlers React Native's responder system calls for a finger's tap: the views on the way to
 * the root are asked to become the responder (capture from the root down, then bubbling up from
 * the view), and the one that accepts is granted the touch and released a moment later. A
 * Pressable, a Touchable or a TextInput answers that as it answers a tap - press in, its delay,
 * press out, `onPress`. A view no responder answers for (a gesture-handler button) is pressed
 * through the nearest component above it that takes an `onPress`.
 *
 * A press waits for its view to be on screen and drawn - read from the native view tree the
 * capture records, as `ready.gone` is (./storyReady) - and presses the topmost match. A step that
 * cannot be played is recorded as what the story threw, naming the step, so the capture reports it
 * and never a silent picture of the wrong screen.
 *
 * Time here is counted in polls, never read off the clock: a story may freeze `Date.now()`.
 */
import { Linking } from 'react-native';
import RunnerBridge from './helpers/RunnerBridge';
import { currentAppFiber } from './appMetadata';
import { recordStoryError } from './getStorybook/storyErrorRegistry';
import type { InspectorDataNode, NativeCalls, WalkedFiber } from './sealedCore/seam';
import type { PlayStep, PressTarget, ReadyRule } from './types/types';

/** How long a press waits for its view, when its step names no time of its own. */
const DEFAULT_PRESS_TIMEOUT_MS = 10_000;
const POLL_MS = 100;
/** How long the finger rests on the view: past a Pressable's press-in delay, short of a long press. */
const PRESS_HOLD_MS = 150;

export type PlayContext = {
  storyId: string;
  getInspectorData: NativeCalls['getInspectorData'] | undefined;
  /** The story's ready wait, for a `ready` step; it throws one line when the screen never is. */
  waitUntilReady: (rule: ReadyRule) => Promise<void>;
  /** Whether the story already has an error, which ends its steps: the error is what it reports. */
  storyErrored: (waitedMs: number) => boolean;
};

/** Play `steps` in order. Never throws: a step that fails is recorded as the story's error. */
export async function playSteps(steps: PlayStep[], context: PlayContext): Promise<void> {
  for (const [index, step] of steps.entries()) {
    const name = `step ${index + 1} of ${steps.length} (${describeStep(step)})`;
    try {
      if ('press' in step) {
        const found = await waitForPressTarget(step, context);
        if (!found) return;
        await press(found.fiber, found.frame);
      } else if ('open' in step) {
        await openLink(step);
        if (context.storyErrored(0)) return;
      } else {
        await context.waitUntilReady(step.ready);
        if (context.storyErrored(0)) return;
      }
      RunnerBridge.log('story step played', { storyId: context.storyId, step: index + 1 });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const message = `Story ${context.storyId} could not play ${name}: ${reason}`;
      recordStoryError(context.storyId, {
        name: 'SherloStepError',
        message,
        stack: '',
        componentStack: '',
      });
      RunnerBridge.log('story step failed', { storyId: context.storyId, step: index + 1, message });
      return;
    }
  }
}

/* ========================================================================== */

/** How long a link has to reach the app's navigation (a `url` event is native code's, a tick later). */
const LINK_SETTLE_MS = 300;

/**
 * Open the link as the system does for a member's tap on it: the app is asked to open its own
 * URL, native code hands it back as a `url` event, and the navigation's linking routes it. Throws
 * one line when the system finds no app for the link (a scheme the app does not register). A link
 * the app registers but its navigation does not route changes nothing on screen; the next
 * `ready` wait (a step's, or the story's) then never is met, and that is what fails the story.
 */
async function openLink(step: { open: string; timeoutMs?: number }): Promise<void> {
  if (typeof step.open !== 'string' || !step.open.includes('://')) {
    throw new Error(`"${step.open}" is not a link (expected scheme://path)`);
  }
  const timeoutMs = step.timeoutMs ?? DEFAULT_PRESS_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tooLate = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`the system did not take the link after ${timeoutMs / 1000} s`)),
      timeoutMs
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

function targetOf(step: { press: string | PressTarget }): PressTarget {
  return typeof step.press === 'string' ? { testID: step.press } : step.press;
}

function describeStep(step: PlayStep): string {
  if ('open' in step) return `open ${step.open}`;
  if (!('press' in step)) return 'ready';
  const { testID, text, index } = targetOf(step);
  const what = testID !== undefined ? `testID "${testID}"` : `text "${text}"`;
  return `press ${what}${index ? ` #${index}` : ''}`;
}

/** Where a view sits in the window, in points. */
type Frame = { x: number; y: number; width: number; height: number };
type Found = { fiber: WalkedFiber; frame: Frame | undefined };

/**
 * Poll until the step's view is on screen and drawn, and answer it. Undefined when the story
 * errored meanwhile. Throws one line when the view never shows.
 */
async function waitForPressTarget(
  step: { press: string | PressTarget; timeoutMs?: number },
  context: PlayContext
): Promise<Found | undefined> {
  const target = targetOf(step);
  if (target.testID === undefined && target.text === undefined) {
    throw new Error('a press names neither a testID nor a text');
  }
  const timeoutMs = step.timeoutMs ?? DEFAULT_PRESS_TIMEOUT_MS;
  let waitedMs = 0;
  let seen = 0;
  for (;;) {
    if (context.storyErrored(waitedMs)) return undefined;
    const visible = await visibleMatches(target, context.getInspectorData);
    seen = visible.length;
    const found = visible[target.index ?? 0];
    if (found) return found;
    if (waitedMs >= timeoutMs) {
      const what =
        target.testID !== undefined ? `testID "${target.testID}"` : `text "${target.text}"`;
      const wanted = target.index ? ` (wanted #${target.index}, ${seen} visible)` : '';
      throw new Error(`no visible view with ${what} after ${timeoutMs / 1000} s${wanted}`);
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
async function visibleMatches(
  target: PressTarget,
  getInspectorData: NativeCalls['getInspectorData'] | undefined
): Promise<Found[]> {
  const root = currentAppFiber();
  if (!root) return [];
  const matches = hostViewsMatching(root, target);
  if (matches.length === 0) return [];

  const drawn = await framesDrawnNatively(getInspectorData);
  const tagsKnown = matches.some((fiber) => nativeTagOf(fiber) !== undefined);
  if (!drawn || !tagsKnown) return matches.map((fiber) => ({ fiber, frame: undefined }));

  const found: Found[] = [];
  for (const fiber of matches) {
    const tag = nativeTagOf(fiber);
    const frame = tag === undefined ? undefined : drawn.frames.get(tag);
    if (frame && middleIsInside(frame, drawn.window)) found.push({ fiber, frame });
  }
  return found.sort((a, b) => a.frame!.y - b.frame!.y || a.frame!.x - b.frame!.x);
}

/** The host views under `root` carrying the target's testID, or showing its text. */
function hostViewsMatching(root: WalkedFiber, target: PressTarget): WalkedFiber[] {
  const found: WalkedFiber[] = [];
  const pending: WalkedFiber[] = [root];
  for (let fiber = pending.pop(); fiber; fiber = pending.pop()) {
    if (typeof fiber.type === 'string' && matches(fiber, target)) found.push(fiber);
    // Children are pushed last-first so the walk visits them in render order.
    const children: WalkedFiber[] = [];
    for (let child = fiber.child; child; child = child.sibling) children.push(child);
    pending.push(...children.reverse());
  }
  return found;
}

function matches(fiber: WalkedFiber, target: PressTarget): boolean {
  if (target.testID !== undefined) return fiber.memoizedProps?.testID === target.testID;
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

/**
 * A host view's native tag, as the new renderer keeps it. The old renderer's views keep theirs
 * under a private name, so there a press takes the rendered matches in render order, unread.
 */
function nativeTagOf(fiber: WalkedFiber): number | undefined {
  const tag = fiber.stateNode?.canonical?.nativeTag;
  return typeof tag === 'number' ? tag : undefined;
}

/**
 * Every view the native tree draws, by tag, with its frame in points, and the window's frame.
 * A view hidden, near-transparent or with no size hides everything under it. Undefined when the
 * tree cannot be read.
 */
async function framesDrawnNatively(
  getInspectorData: NativeCalls['getInspectorData'] | undefined
): Promise<{ frames: Map<number, Frame>; window: Frame } | undefined> {
  if (!getInspectorData) return undefined;
  let data;
  try {
    data = await getInspectorData();
  } catch {
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

/* ---- The press ----------------------------------------------------------------------------- */

type Responder = { fiber: WalkedFiber; props: Record<string, any> };

/**
 * Press `fiber` as a finger's tap would: the view that becomes the responder is granted the touch
 * and released after PRESS_HOLD_MS. With no responder on the way to the root, the nearest component
 * above the view that takes an `onPress` is called. Throws when nothing answers.
 */
async function press(fiber: WalkedFiber, frame: Frame | undefined): Promise<void> {
  const path = hostPathToRoot(fiber);
  const touchAt = frame
    ? { pageX: frame.x + frame.width / 2, pageY: frame.y + frame.height / 2 }
    : { pageX: 0, pageY: 0 };
  const touchTarget = publicInstanceOf(fiber);
  let timestamp = 0;
  const eventFor = (responder: WalkedFiber | undefined, phase: string) =>
    touchEvent(touchTarget, responder && publicInstanceOf(responder), touchAt, timestamp, phase);

  const responder = findResponder(path, eventFor);
  if (responder) {
    responder.props.onResponderGrant?.(eventFor(responder.fiber, 'onResponderGrant'));
    await new Promise((resolve) => setTimeout(resolve, PRESS_HOLD_MS));
    timestamp += PRESS_HOLD_MS;
    responder.props.onResponderRelease?.(eventFor(responder.fiber, 'onResponderRelease'));
    return;
  }

  for (let above: WalkedFiber | null | undefined = fiber; above; above = above.return) {
    const onPress = above.memoizedProps?.onPress;
    if (typeof onPress === 'function') {
      onPress(eventFor(fiber, 'onPress'));
      return;
    }
  }
  throw new Error('nothing at the view answers a press (no responder and no onPress above it)');
}

/** The host views from `fiber` up to the root, `fiber` first. */
function hostPathToRoot(fiber: WalkedFiber): WalkedFiber[] {
  const path: WalkedFiber[] = [];
  for (let node: WalkedFiber | null | undefined = fiber; node; node = node.return) {
    if (typeof node.type === 'string' && node.memoizedProps) path.push(node);
  }
  return path;
}

/**
 * The view that takes the touch, as React Native's responder system picks it: any view asking
 * during the capture phase, from the root down, else the first view asking as the start bubbles
 * up from the touched view.
 */
function findResponder(
  path: WalkedFiber[],
  eventFor: (responder: WalkedFiber, phase: string) => object
): Responder | undefined {
  const asks = (fiber: WalkedFiber, handler: string): boolean => {
    const ask = fiber.memoizedProps?.[handler];
    return typeof ask === 'function' && ask(eventFor(fiber, handler)) === true;
  };
  const capturing = [...path]
    .reverse()
    .find((fiber) => asks(fiber, 'onStartShouldSetResponderCapture'));
  const responder = capturing ?? path.find((fiber) => asks(fiber, 'onStartShouldSetResponder'));
  return responder ? { fiber: responder, props: responder.memoizedProps } : undefined;
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
  const touch = {
    identifier: 0,
    pageX: at.pageX,
    pageY: at.pageY,
    locationX: 0,
    locationY: 0,
    timestamp,
    target,
  };
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
