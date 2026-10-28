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

type RouteState = { index?: number; routes?: { name?: string; state?: RouteState }[] };

/** The focused route in each nested navigator, outermost first; empty when it cannot be read. */
export function reachedRoute(): string[] {
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

function focusedPath(state: RouteState | undefined): string[] {
  const names: string[] = [];
  for (let current = state; current?.routes;) {
    const route = current.routes[current.index ?? current.routes.length - 1];
    if (!route?.name) break;
    names.push(route.name);
    current = route.state;
  }
  return names;
}
