/**
 * WHERE A FINGER CAN REACH: the part of the window a tap can land on. The phone's status bar and
 * navigation bar cover the window's edges; the app says how far in they reach through the
 * safe-area insets its `SafeAreaInsetsContext` provides, read from the rendered tree.
 */
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
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
