/**
 * THE RUNNER'S WALK OF A LAUNCH'S STORY, shared by the Storybook road (useTestStory) and an app of
 * scenes and no Storybook (./sceneBoot): the one place that says when a runner drives a boot and
 * how the story is handed to the sealed core and answered.
 */
import { bundlerOrigin } from './bundlerOrigin';
import { clearMocks } from './mocking';
import { reachedRoute } from './reachedScreen';
import { getSealedCore } from './sealedCore/loadSealedCore';
import type { Metadata, SafeAreaInsets } from './sealedCore/seam';
import { monotonicNow } from './settleClock';

/** One change of the screen the app is on: the route it moved to, and when (ms since the app started). */
export type RouteChange = { route: string[]; atMs: number };

/** How often the walk looks at the route, in ms. */
const ROUTE_LOOK_MS = 100;

const routeChanges: RouteChange[] = [];

/** Every route change of the launch so far, in the order they happened. */
export function routeChangesSoFar(): RouteChange[] {
  return [...routeChanges];
}

/** One look at the route: a change is kept when the app is on a route it was not on at the last look. */
export function lookAtTheRoute(): void {
  const route = reachedRoute();
  const last = routeChanges[routeChanges.length - 1];
  if (route.length === 0 || last?.route.join('/') === route.join('/')) return;
  routeChanges.push({ route, atMs: monotonicNow() });
}

/**
 * Whether a runner drives this boot. A capture's boot produces the same `config`/`lastState` shape
 * a run's does, but a capture is asked for by a bundler and its bundle came from that bundler,
 * while a run installs a build whose bundle is loaded from the device.
 */
export function isDrivenByRunner(): boolean {
  return bundlerOrigin() === null;
}

/**
 * The launch's story goes to the sealed core, which waits until it is ready and reports it to the
 * runner. However the walk ended, every mocked module passes through to its real implementation
 * again (IS-07). While it walks, each route change is kept (routeChangesSoFar).
 */
export async function walkTheStoryForTheRunner(story: {
  insets: SafeAreaInsets;
  collectMetadata: () => Metadata | undefined;
}): Promise<void> {
  routeChanges.length = 0;
  lookAtTheRoute();
  const looking = setInterval(lookAtTheRoute, ROUTE_LOOK_MS);
  try {
    const core = getSealedCore();
    if (!core) return;

    await core.testStory(story);
  } finally {
    clearInterval(looking);
    lookAtTheRoute();
    clearMocks();
  }
}
