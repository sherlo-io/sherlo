// tapReach reads where a finger can land: the safe-area insets the nearest provider above a view
// gives, where a view's middle lies against the window and the bars those insets name, and what
// took a native touch meant for a view.
import { coverOf, reachOf, safeAreaInsetsAbove } from '../tapReach';
import type { WalkedFiber } from '../sealedCore/seam';

import { SafeAreaInsetsContext as insetsContext } from 'react-native-safe-area-context';

const WINDOW = { x: 0, y: 0, width: 390, height: 844 };
const INSETS = { top: 47, right: 0, bottom: 34, left: 0 };

function fiberOf(type: unknown, value: object | undefined, parent?: WalkedFiber): WalkedFiber {
  const props = value ? { value } : {};
  return { type, pendingProps: props, memoizedProps: props, return: parent };
}

describe('the bars a tap cannot reach', () => {
  it('finds the insets of the provider above a view, on React 19 and on React 18', () => {
    const provider19 = fiberOf(insetsContext, INSETS);
    const provider18 = fiberOf(insetsContext.Provider, INSETS);

    expect(safeAreaInsetsAbove(fiberOf('RCTView', undefined, provider19))).toEqual(INSETS);
    expect(safeAreaInsetsAbove(fiberOf('RCTView', undefined, provider18))).toEqual(INSETS);
  });

  it("finds the insets of a second copy of the package by the context's name", () => {
    const copy = { Provider: {}, displayName: 'SafeAreaInsetsContext' };

    expect(safeAreaInsetsAbove(fiberOf('RCTView', undefined, fiberOf(copy, INSETS)))).toEqual(
      INSETS
    );
  });

  it('finds no insets under a context of the same shape that is not the safe area', () => {
    const spacing = { Provider: {}, displayName: 'SpacingContext' };
    const view = fiberOf('RCTView', undefined, fiberOf(spacing, INSETS));

    expect(safeAreaInsetsAbove(view)).toBeUndefined();
  });

  it('takes the nearest provider above the view', () => {
    const inner = { top: 0, right: 0, bottom: 0, left: 0 };
    const nested = fiberOf(insetsContext, inner, fiberOf(insetsContext, INSETS));

    expect(safeAreaInsetsAbove(fiberOf('RCTView', undefined, nested))).toEqual(inner);
  });

  it('puts a middle in a bar under the bars, outside the window off screen, and elsewhere inside', () => {
    expect(reachOf({ x: 0, y: 780, width: 100, height: 64 }, WINDOW, INSETS)).toBe('underBars');
    expect(reachOf({ x: 0, y: 0, width: 100, height: 40 }, WINDOW, INSETS)).toBe('underBars');
    expect(reachOf({ x: 0, y: 700, width: 100, height: 60 }, WINDOW, INSETS)).toBe('inside');
    expect(reachOf({ x: 0, y: 900, width: 100, height: 60 }, WINDOW, INSETS)).toBe('offScreen');
    expect(reachOf({ x: 0, y: 780, width: 100, height: 64 }, WINDOW, undefined)).toBe('inside');
  });
});

describe('what a native touch hit', () => {
  /** A host view tagged `tag`, with these props, its children under it. */
  function host(tag: number, props: object, children: WalkedFiber[] = []): WalkedFiber {
    const fiber: WalkedFiber = {
      type: 'RCTView',
      pendingProps: props,
      memoizedProps: props,
      stateNode: { canonical: { nativeTag: tag } },
    };
    children.forEach((child, index) => {
      child.return = fiber;
      if (index === 0) fiber.child = child;
      else children[index - 1].sibling = child;
    });
    return fiber;
  }
  const root = host(1, {}, [
    host(12, { testID: 'Connections' }, [host(13, {})]),
    host(99, { testID: 'modal.backdrop' }),
    host(98, {}),
  ]);
  const touch = (hitTag: number, reachedReact = true) => ({
    reachedReact,
    hitTag,
    hitClass: 'RCTViewComponentView',
    missing: [],
  });

  it('finds no cover when the touch hit the target or a view inside it', () => {
    expect(coverOf(root, 12, touch(12))).toBeUndefined();
    expect(coverOf(root, 12, touch(13))).toBeUndefined();
    // A hit inside the target that no React recognizer took is no cover: nothing lies over it.
    expect(coverOf(root, 12, touch(12, false))).toBeUndefined();
  });

  it('names another view the touch hit by its testID, else by its class, as a native view no React recognizer saw', () => {
    expect(coverOf(root, 12, touch(99))).toEqual({
      testID: 'modal.backdrop',
      className: 'RCTViewComponentView',
    });
    expect(coverOf(root, 12, touch(98))).toEqual({ className: 'RCTViewComponentView' });
    expect(coverOf(root, 12, touch(99, false))).toEqual({
      testID: 'modal.backdrop',
      className: 'RCTViewComponentView',
    });
    expect(coverOf(root, 12, touch(-1))).toEqual({ className: 'RCTViewComponentView' });
  });
});
