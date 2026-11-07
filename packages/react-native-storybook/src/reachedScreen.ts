/**
 * THE SCREEN THE APP REACHED, named from the app's own tree: React Navigation's focused route,
 * outermost first (`['ChatStack', 'Chat']`). The app hands over nothing: its navigation container
 * publishes a ref through a context, whose provider fiber holds `getRootState` in its `value`
 * prop. The state it returns is the whole nested navigator state; the focused route is followed
 * down by each navigator's `index`.
 *
 * An app with no React Navigation container, or a state that cannot be read, has no route: the
 * record then names none, never a guessed one.
 */
import { currentAppFiber } from './componentNames';
import type { WalkedFiber } from './sealedCore/seam';

type RouteParams = { screen?: unknown; params?: RouteParams };
type RouteState = {
  type?: string;
  index?: number;
  routes?: { name?: string; key?: string; state?: RouteState; params?: RouteParams }[];
};
type FocusedRoute = { name: string; key?: string };

/** The focused route in each nested navigator, outermost first; empty when it cannot be read. */
export function reachedRoute(): string[] {
  return focusedRoutes().map((route) => route.name);
}

/**
 * Whether a view belongs to the focused screen: not drawn under a stack screen the app has moved
 * on from, nor in a tab it left, both of which React Navigation keeps mounted. A view outside
 * every screen (an overlay of the app's root), or an app whose route cannot be read, is not judged.
 */
export function isOnFocusedRoute(view: WalkedFiber): boolean {
  const focused = focusedRoutes();
  if (focused.length === 0) return true;
  for (let up = view.return; up; up = up.return) {
    const value = up.memoizedProps?.value;
    if (isRoute(value)) return focused.some((route) => route.key === value.key);
  }
  return true;
}

/** A screen's route object as React Navigation hands it down: its key is its name and a unique id. */
function isRoute(value: unknown): value is { name: string; key: string } {
  const route = value as { name?: unknown; key?: unknown } | null;
  return (
    !!route &&
    typeof route.name === 'string' &&
    typeof route.key === 'string' &&
    route.key.startsWith(route.name + '-')
  );
}

function focusedRoutes(): FocusedRoute[] {
  const root = currentAppFiber();
  const getRootState = root && findGetRootState(root);
  if (!getRootState) return [];
  try {
    return focusedPath(getRootState());
  } catch (_) {
    // The app's own navigation threw when asked: the route is unknown, never a wrong one.
    return [];
  }
}

function findGetRootState(root: WalkedFiber): (() => RouteState | undefined) | undefined {
  const pending: WalkedFiber[] = [root];
  for (let fiber = pending.pop(); fiber; fiber = pending.pop()) {
    const value = fiber.memoizedProps?.value;
    if (value && typeof value === 'object' && typeof value.getRootState === 'function') {
      return value.getRootState.bind(value);
    }
    if (fiber.sibling) pending.push(fiber.sibling);
    if (fiber.child) pending.push(fiber.child);
  }
  return undefined;
}

function focusedPath(state: RouteState | undefined): FocusedRoute[] {
  const names: FocusedRoute[] = [];
  for (let current = state; current?.routes;) {
    const route = current.routes[current.index ?? defaultFocus(current)];
    if (!route?.name) break;
    names.push({ name: route.name, key: route.key });
    if (route.state) {
      current = route.state;
    } else {
      // A navigator the route opens but has not mounted yet (a deep link behind a modal): its
      // screen waits in the route's params, and is the screen the app is on.
      names.push(...pendingScreens(route.params).map((name) => ({ name })));
      break;
    }
  }
  return names;
}

/** Where a navigator whose state names no index is focused: tabs and drawers on the first, a stack on the last. */
function defaultFocus(state: RouteState): number {
  return state.type === 'tab' || state.type === 'drawer' ? 0 : (state.routes?.length ?? 1) - 1;
}

/** The screens a route's params open inside a navigator not yet mounted, outermost first. */
function pendingScreens(params: RouteParams | undefined): string[] {
  const names: string[] = [];
  for (let current = params; typeof current?.screen === 'string'; current = current.params) {
    names.push(current.screen);
  }
  return names;
}
