/**
 * THE SCREEN THE APP REACHED, named from the app's own tree: React Navigation's focused route,
 * outermost first ("ChatStack › Chat"). No handle from the app is needed: the navigation container
 * publishes its ref through a context (NavigationContainerRefContext), whose provider fiber holds
 * `getRootState` in its `value` prop. The state it returns is the whole nested navigator state;
 * the focused route is followed down by each navigator's `index`.
 *
 * Undefined when the app has no React Navigation container, or the state cannot be read: the
 * record then has no screen name, never a guessed one.
 */
import { currentAppFiber } from './appMetadata';
import type { WalkedFiber } from './sealedCore/seam';

type RouteState = { index?: number; routes?: { name?: string; state?: RouteState }[] };

/** Names of the focused route in each nested navigator, outermost first; undefined if unreadable. */
export function reachedScreen(): string[] | undefined {
  const root = currentAppFiber();
  if (!root) return undefined;
  const getRootState = findGetRootState(root);
  if (!getRootState) return undefined;
  try {
    return focusedPath(getRootState());
  } catch {
    return undefined;
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

function focusedPath(state: RouteState | undefined): string[] | undefined {
  const names: string[] = [];
  for (let current = state; current?.routes;) {
    const route = current.routes[current.index ?? current.routes.length - 1];
    if (!route?.name) break;
    names.push(route.name);
    current = route.state;
  }
  return names.length > 0 ? names : undefined;
}
