/**
 * WHERE A FINGER CAN REACH: the part of the window a tap can land on. The phone's status bar and
 * navigation bar cover the window's edges; the app says how far in they reach through the
 * safe-area insets its `SafeAreaInsetsContext` provides, read from the rendered tree. A view laid
 * over the target (a modal's backdrop, a toast, a native sheet) takes a real touch in its place:
 * `coverOf` reads what the native touch hit against the target.
 */
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { NativeTapAnswer } from './SherloModule';
import type { WalkedFiber } from './sealedCore/seam';

/** Where a view sits in the window, in points. */
export type Frame = { x: number; y: number; width: number; height: number };
export type Insets = { top: number; right: number; bottom: number; left: number };
/** Where the middle of a view lies: where a tap lands. */
export type Reach = 'inside' | 'underBars' | 'offScreen';

/** The reason a tap gives when its view is there but a finger cannot reach it. */
export const UNDER_BARS_REASON =
  "the view is there but under the phone's bars or off screen, so a tap cannot reach it; keep it inside the safe area";

/**
 * Whether `fiber` provides the safe-area insets: by identity (React 19 renders the context itself
 * as the provider, React 18 its `Provider`), else by name (a second copy of the package, React 19).
 */
function providesInsets(fiber: WalkedFiber): boolean {
  const type = fiber.type;
  return (
    type === SafeAreaInsetsContext ||
    type === SafeAreaInsetsContext.Provider ||
    (typeof type === 'object' &&
      type !== null &&
      type.displayName === 'SafeAreaInsetsContext' &&
      type.Provider !== undefined)
  );
}

/** The insets of the nearest safe-area provider above `fiber`, or none. */
export function safeAreaInsetsAbove(fiber: WalkedFiber): Insets | undefined {
  for (let node: WalkedFiber | null | undefined = fiber; node; node = node.return) {
    if (providesInsets(node)) return node.memoizedProps?.value ?? undefined;
  }
  return undefined;
}

/** Where the middle of `frame` lies in `window`, with the bars `insets` name (none: no bars known). */
export function reachOf(frame: Frame, window: Frame, insets: Insets | undefined): Reach {
  const x = frame.x + frame.width / 2;
  const y = frame.y + frame.height / 2;
  if (x < window.x || x >= window.x + window.width) return 'offScreen';
  if (y < window.y || y >= window.y + window.height) return 'offScreen';
  if (!insets) return 'inside';
  const under =
    y < window.y + insets.top ||
    y >= window.y + window.height - insets.bottom ||
    x < window.x + insets.left ||
    x >= window.x + window.width - insets.right;
  return under ? 'underBars' : 'inside';
}

/** The host views under `root` that `matching` accepts, in render order. */
export function hostViewsMatching(
  root: WalkedFiber,
  matching: (f: WalkedFiber) => boolean
): WalkedFiber[] {
  const found: WalkedFiber[] = [];
  const pending: WalkedFiber[] = [root];
  for (let fiber = pending.pop(); fiber; fiber = pending.pop()) {
    if (typeof fiber.type === 'string' && matching(fiber)) found.push(fiber);
    // Children are pushed last-first so the walk visits them in render order.
    const children: WalkedFiber[] = [];
    for (let child = fiber.child; child; child = child.sibling) children.push(child);
    pending.push(...children.reverse());
  }
  return found;
}

/** A host view's native tag, as the new renderer keeps it (the old renderer's are not read). */
export function nativeTagOf(fiber: WalkedFiber): number | undefined {
  const tag = fiber.stateNode?.canonical?.nativeTag;
  return typeof tag === 'number' ? tag : undefined;
}

/**
 * What took a native touch meant for the view tagged `targetTag`, or undefined when the touch
 * reached it: the hit view is the target or inside it, whether or not a React recognizer took the
 * touch (the caller tells those apart). A cover React draws is answered as its host view under
 * `root`, with its testID when it has one; a native one (no React view) by its class alone.
 */
export function coverOf(
  root: WalkedFiber | undefined,
  targetTag: number | undefined,
  touched: NativeTapAnswer
): { testID?: string; className: string } | undefined {
  const className = touched.hitClass;
  if (!root || touched.hitTag < 0) return { className };
  const [hit] = hostViewsMatching(root, (fiber) => nativeTagOf(fiber) === touched.hitTag);
  for (let node: WalkedFiber | null | undefined = hit; node; node = node.return) {
    if (targetTag !== undefined && nativeTagOf(node) === targetTag) return undefined;
  }
  const testID = hit?.memoizedProps?.testID;
  return typeof testID === 'string' ? { testID, className } : { className };
}

/** What handlers are handed as the view: the new renderer's public instance, or the old view. */
export function publicInstanceOf(fiber: WalkedFiber): unknown {
  return fiber.stateNode?.canonical?.publicInstance ?? fiber.stateNode;
}

/**
 * A touch event in the shape React Native hands responder handlers, naming its `phase` (the handler
 * it is handed to) as `dispatchConfig.registrationName` does: TouchableOpacity reads it.
 */
export function touchEvent(
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
