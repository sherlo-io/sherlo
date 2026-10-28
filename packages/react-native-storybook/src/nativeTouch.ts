/**
 * WHAT A STEP'S NATIVE TOUCH DID: why a tap's or a swipe's real touch never reached its view, and
 * the swipe itself. A swipe is a finger put down on the middle of the view, moved most of the way to
 * its edge at a finger's pace, and lifted (ios and android TouchHelper), so a row's swipe actions
 * open as they do for a member. It has no synthetic stand-in: a phone that cannot make the touch
 * ends the step with its line.
 */
import { Platform } from 'react-native';
import SherloModule from './SherloModule';
import type { NativeTapAnswer } from './SherloModule';
import { currentAppFiber } from './componentNames';
import type { WalkedFiber } from './sealedCore/seam';
import type { SwipeStep } from './scenes';
import { coverOf, nativeTagOf } from './tapReach';
import type { Frame } from './tapReach';
import { nameOf } from './visibleViews';
import type { Found } from './visibleViews';

/** How long a swipe's finger takes to cross the view: a member's swipe, not a fling. */
const SWIPE_MS = 300;
/** How far a swipe goes from the view's middle toward its edge: most of the way, never past it. */
const SWIPE_REACH = 0.9;

/**
 * Why the native touch never reached `fiber`, or undefined when it did: this iOS lacks the private
 * calls the touch is made of, or another view covers the target.
 */
export function unreachedReason(
  fiber: WalkedFiber,
  touched: NativeTapAnswer,
  verb: 'tap' | 'long-press' | 'swipe'
): string | undefined {
  if (touched.missing.length > 0) {
    return `Sherlo cannot ${verb} on iOS ${Platform.Version} yet. Update Sherlo, or report it to Sherlo if the newest Sherlo still says this`;
  }
  const cover = coverOf(currentAppFiber(), nativeTagOf(fiber), touched);
  if (!cover) return undefined;
  const covering = cover.testID !== undefined ? nameOf({ testID: cover.testID }) : cover.className;
  return `the target is covered by ${covering}, so the ${verb} never reached it. Wait for the cover to close, or close it with a tap step before this one`;
}

/**
 * Where a swipe of the view at `frame` starts and ends, in points: the view's middle, and most of
 * the way from there to its edge in `direction`, so the finger stays on the view it drags.
 */
export function swipeLine(
  frame: Frame,
  direction: SwipeStep['swipe']['direction']
): { fromX: number; fromY: number; toX: number; toY: number } {
  const fromX = frame.x + frame.width / 2;
  const fromY = frame.y + frame.height / 2;
  const across = (SWIPE_REACH * frame.width) / 2;
  const down = (SWIPE_REACH * frame.height) / 2;
  const [dx, dy] = {
    left: [-across, 0],
    right: [across, 0],
    up: [0, -down],
    down: [0, down],
  }[direction];
  return { fromX, fromY, toX: fromX + dx, toY: fromY + dy };
}

/**
 * Swipe the view found by the native touch, along `swipeLine` over SWIPE_MS. Throws when the view's
 * place on screen is unknown, when the app's native code has no swipe, and as a tap does when the
 * touch never reached the view.
 */
export async function swipeView(
  { fiber, frame }: Found,
  direction: SwipeStep['swipe']['direction']
): Promise<void> {
  if (!frame) {
    throw new Error(
      'the view has no readable position on screen, so it could not be swiped. Point the step at a view that is on screen.'
    );
  }
  const { fromX, fromY, toX, toY } = swipeLine(frame, direction);
  const touched = await SherloModule.swipe(fromX, fromY, toX, toY, SWIPE_MS);
  if (!touched) {
    throw new Error('this app was built before swipes existed. Rebuild it with the newest Sherlo.');
  }
  const unreached = unreachedReason(fiber, touched, 'swipe');
  if (unreached) throw new Error(unreached);
}
