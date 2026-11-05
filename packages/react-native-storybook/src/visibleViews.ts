/**
 * THE VIEWS ON SCREEN, FOUND BY WHAT A SCENE NAMES THEM BY: a testID, the text they show or their
 * accessibility label. A tap step (./playSteps) finds its target here, and a scene's ready rule
 * (./storyReady) judges its text and label views here, so both mean the same by "shown".
 */
import SherloModule from './SherloModule';
import { currentAppFiber } from './componentNames';
import type { InspectorDataNode, WalkedFiber } from './sealedCore/seam';
import type { TapTarget } from './scenes';
import { hostViewsMatching, nativeTagOf, reachOf, safeAreaInsetsAbove } from './tapReach';
import type { Frame, Reach } from './tapReach';

export type Found = {
  fiber: WalkedFiber;
  frame: Frame | undefined;
  /** Where the middle of the view lies; unknown (taken as inside) without the native tree. */
  reach?: Reach;
};

/**
 * The drawn views that `matching` accepts, topmost first (then leftmost), each with where its middle
 * lies (see `reachOf`). Read against the native tree when it can be: a view it does not draw is
 * left out. Without the tree, or the tags that join it to React's views (the old
 * renderer), every rendered match in render order.
 */
export async function visibleViews(matching: (fiber: WalkedFiber) => boolean): Promise<Found[]> {
  const root = currentAppFiber();
  const matches = root ? hostViewsMatching(root, matching) : [];
  if (matches.length === 0) return [];

  const drawn = await framesDrawnNatively();
  if (!drawn || !matches.some((fiber) => nativeTagOf(fiber) !== undefined)) {
    return matches.map((fiber) => ({ fiber, frame: undefined }));
  }
  const found: Found[] = [];
  for (const fiber of matches) {
    const tag = nativeTagOf(fiber);
    const frame = tag === undefined ? undefined : drawn.frames.get(tag);
    if (frame) {
      found.push({ fiber, frame, reach: reachOf(frame, drawn.window, safeAreaInsetsAbove(fiber)) });
    }
  }
  return found.sort((a, b) => a.frame!.y - b.frame!.y || a.frame!.x - b.frame!.x);
}

/** Whether a view of `target` is drawn with its middle on screen: the frame rule a tap waits for. */
export async function isDrawn(target: TapTarget): Promise<boolean> {
  const drawn = await visibleViews((fiber) => isTarget(fiber, target));
  return drawn.some((view) => view.reach !== 'offScreen');
}

/**
 * A text as the match reads it: trimmed, with the typed quote marks and the app's typographic ones
 * taken as the same (’ ‘ and ', “ ” and "), and every run of whitespace (spaces, tabs, line breaks,
 * the non-breaking space) read as one space. The whole string stays: no part of it is matched.
 */
function textAsMatched(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

export function isTarget(fiber: WalkedFiber, target: TapTarget): boolean {
  if (target.testID !== undefined) return fiber.memoizedProps?.testID === target.testID;
  if (target.label !== undefined) return fiber.memoizedProps?.accessibilityLabel === target.label;
  return (
    fiber.type === 'RCTText' &&
    target.text !== undefined &&
    textAsMatched(textOf(fiber)) === textAsMatched(target.text)
  );
}

/** A target as a step's words name it: `testID "Row"`, `text "Row"` or `label "Row"`. */
export function nameOf(target: TapTarget): string {
  if (target.testID !== undefined) return `testID "${target.testID}"`;
  if (target.text !== undefined) return `text "${target.text}"`;
  return `label "${target.label}"`;
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

/** One view as a look reads it: what names it, and what a picture of it would show. */
export type ViewLook = {
  /** Joins the same view in two looks: its native tag, else its place in render order. */
  key: string;
  /** The innermost app component that renders it, else the host type. */
  component: string;
  testID?: string;
  text: string;
  frame?: Frame;
};

/** The innermost component above the fiber that has a name of its own, else the view's own type. */
function componentOf(fiber: WalkedFiber): string {
  for (let node: WalkedFiber | null | undefined = fiber.return; node; node = node.return) {
    const type = node.type;
    const name =
      typeof type === 'function'
        ? (type.displayName ?? type.name)
        : (type?.type?.name ?? type?.render?.name);
    if (name) return name;
  }
  return String(fiber.type);
}

/** Every host view of the app on screen now, read without waiting. Empty before the app renders. */
export async function lookAtViews(): Promise<ViewLook[]> {
  const root = currentAppFiber();
  const views = root ? hostViewsMatching(root, () => true) : [];
  const drawn = await framesDrawnNatively();
  return views.map((fiber, place) => {
    const tag = nativeTagOf(fiber);
    const testID = fiber.memoizedProps?.testID;
    return {
      key: tag === undefined ? `place ${place}` : `tag ${tag}`,
      component: componentOf(fiber),
      ...(typeof testID === 'string' ? { testID } : {}),
      text: fiber.type === 'RCTText' ? textOf(fiber) : '',
      frame: tag === undefined ? undefined : drawn?.frames.get(tag),
    };
  });
}

/** A frame as a picture shows it: whole points, so a sub-pixel float is no change. */
function boxOf(frame: Frame | undefined): string {
  return frame
    ? [frame.x, frame.y, frame.width, frame.height].map(Math.round).join(',')
    : 'unknown';
}

/**
 * The views that differ between two looks (a different text, place or size, or a view that came or
 * went), each named by its component and, when it has one, its test id: Bubble "msg-3". Once each.
 */
export function viewsThatChanged(before: ViewLook[], after: ViewLook[]): string[] {
  const earlier = new Map(before.map((look) => [look.key, look]));
  const later = new Map(after.map((look) => [look.key, look]));
  const names = new Set<string>();
  for (const key of new Set([...earlier.keys(), ...later.keys()])) {
    const was = earlier.get(key);
    const now = later.get(key);
    if (was && now && was.text === now.text && boxOf(was.frame) === boxOf(now.frame)) continue;
    const look = (now ?? was)!;
    names.add(look.testID ? `${look.component} "${look.testID}"` : look.component);
  }
  return [...names];
}
