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
import type { SwipeStep, TapTarget } from './scenes';
import {
  coverOf,
  findInWindows,
  missingFromWindows,
  nativeTagOf,
  windowsLookedIn,
} from './tapReach';
import type { Frame, WindowViews } from './tapReach';
import { nameOf } from './visibleViews';
import type { Found } from './visibleViews';

/** How long a swipe's finger takes to cross the view: a member's swipe, not a fling. */
const SWIPE_MS = 300;
/** How far a swipe goes from the view's middle toward its edge: most of the way, never past it. */
const SWIPE_REACH = 0.9;

/**
 * Why the native touch touched nothing, whatever the target: this iOS lacks the private calls the
 * touch is made of, or it fell on a window itself and no view in any window took it.
 */
function touchedNothingReason(
  touched: NativeTapAnswer,
  verb: 'tap' | 'long-press' | 'swipe'
): string | undefined {
  if (touched.missing.length > 0) {
    return `Sherlo cannot ${verb} on iOS ${Platform.Version} yet. Update Sherlo, or report it to Sherlo if the newest Sherlo still says this`;
  }
  if (touched.hitTag < 0 && touched.windows?.includes(touched.hitClass)) {
    return `no view took the ${verb} at that point. ${windowsLookedIn(touched.windows)}`;
  }
  return undefined;
}

/**
 * Tap the view a pop-up's window shows under the label a step names, which React never drew (an
 * alert's button): the native touch at its middle, held `holdMs`. Undefined once tapped; else why
 * no window shows it, naming the windows looked in (empty when the phone names none). Throws as a
 * tap does when the touch touched nothing.
 */
export async function tapInPopup(
  target: TapTarget,
  holdMs: number,
  verb: 'tap' | 'long-press'
): Promise<string | undefined> {
  const label = target.label ?? target.text;
  if (label === undefined) return '';
  const windows = await SherloModule.getWindowViews();
  const place = windowToTouch(windows, label);
  if (!place) {
    const names = windows.map((window) => window.name);
    return names.length > 0 ? missingFromWindows(label, names) : '';
  }
  // Only the window that shows the label is touched, so a window above it never takes the touch.
  const touched = await SherloModule.tapInWindow(place.x, place.y, holdMs, place.windowIndex);
  const nothing = touched && touchedNothingReason(touched, verb);
  if (nothing) throw new Error(nothing);
  return undefined;
}

/**
 * Why the native touch never reached `fiber`, or undefined when it did: it touched nothing, or
 * another view covers the target.
 */
export function unreachedReason(
  fiber: WalkedFiber,
  touched: NativeTapAnswer,
  verb: 'tap' | 'long-press' | 'swipe'
): string | undefined {
  const nothing = touchedNothingReason(touched, verb);
  if (nothing) return nothing;
  const cover = coverOf(currentAppFiber(), nativeTagOf(fiber), touched);
  if (!cover) return undefined;
  const covering = cover.testID !== undefined ? nameOf({ testID: cover.testID }) : cover.className;
  return `the target is covered by ${covering}, so the ${verb} never reached it. Wait for the cover to close, or close it with a tap step before this one`;
}

/**
 * Where a tap on the view labeled `label` lands, and the window it is sent to: the middle of the
 * view in the topmost of `windows` (topmost first) that shows one, so a pop-up's button is touched
 * in the pop-up's window and never in the app's window under it. Undefined when no window shows it.
 */
export function windowToTouch(
  windows: WindowViews[],
  label: string
): { window: string; windowIndex: number; x: number; y: number } | undefined {
  const found = findInWindows(windows, label);
  if (!found) return undefined;
  const { frame } = found;
  // The place in the list, not the name: two windows can be of one class.
  const windowIndex = windows.findIndex((window) =>
    window.views.some((view) => view.label === label)
  );
  return {
    window: found.window,
    windowIndex,
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  };
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
