/**
 * THE APP'S OWN COMPONENT NAMES, for the view tree a capture records.
 *
 * A capture prints one line per native view, and `ProfileHeader › Text` tells a developer where
 * they are while `RCTTextView` tells them nothing. So every native view carries, beside its
 * primitive, the names of the app's components that render it, outermost first.
 *
 * A NAME BELONGS TO ONE NATIVE VIEW, AND TO EVERYTHING IT DRAWS UNTIL THE NEXT ONE. The names a
 * view carries are the components between it and the native view above it: the `Text` a
 * `SampleLine` returns reads `SampleLine › Text`, and the `View` a `Spinner` returns reads
 * `Spinner › View`. A name is not repeated on everything underneath that view, which is what keeps
 * a tree readable instead of stamping the whole app onto every leaf.
 *
 * ONLY THE APP'S OWN COMPONENTS ARE NAMED. A story is rendered inside Storybook, which is itself
 * rendered inside Sherlo, and none of that is the app: a reading starts where the app's story
 * starts (./storyOfTheApp), so a view above the story carries no names at all and no view carries
 * Storybook's or Sherlo's. Storybook's own wrappers around a story are anonymous functions, so
 * they name nothing even inside that range.
 *
 * THE NAMES COME FROM THE FUNCTIONS THEMSELVES - a component's own name, or the one its author
 * gave it. They survive only in a bundle that kept them: a minified bundle renames the functions
 * and an anonymous one has no name at all, so a name that is not there is absent rather than
 * invented. A development bundle is never minified, and a test run's bundle is built unminified
 * for this reason, so the cloud and a capture print the same names.
 *
 * WHO HANDS THE FIBERS OVER. The names live on the fibers the app is rendered from, and a capture
 * is plain JavaScript with no component of its own. The one component that renders the story
 * publishes the fiber it renders from, and a capture walks that tree afterwards and reads off the
 * names of the native views it found. This file keeps no React: it is read on the capture's own
 * road, which has no renderer on it.
 */

/**
 * One node of the fiber tree the app is rendered from, as much of it as naming a view reads.
 *
 * A fiber typed by a string draws a native view; any other fiber draws a component of its own,
 * which is where the names come from. The native tag on a host fiber is the id the inspector
 * reports for the same view, which is how a name finds the view that carries it.
 */
export type RenderedFiber = {
  type: unknown;
  stateNode?: unknown;
  child?: RenderedFiber | null;
  sibling?: RenderedFiber | null;
};

/** The names of the app's components that render each native view, by the view's native tag. */
export type ComponentNamesByNativeTag = Map<number, string[]>;

/** The top of the app's story, or nothing before it has been rendered. */
let storyOfTheApp: RenderedFiber | undefined;

/**
 * The app's story is on screen, rendered from this fiber; `undefined` forgets it. Called by
 * StoryOfTheApp while it is mounted, and by the tests that walk a fiber tree of their own.
 */
export function rememberStoryOfTheApp(fiber: RenderedFiber | undefined): void {
  storyOfTheApp = fiber;
}

/**
 * The fiber the app's story is rendered from, or nothing before it has rendered - the top of any
 * walk over the story. Naming the views is one such walk; reading another fact off the story's own
 * fibers is another (../captureTransport), and both start here.
 */
export function storyOfTheAppFiber(): RenderedFiber | undefined {
  return storyOfTheApp;
}

/**
 * Every name the app on screen carries, by the native tag of the view it belongs to. A view whose
 * bundle kept no names for it is absent rather than listed with none, because a caller drawing a
 * tree does the same thing with both and an absent entry costs nothing to build.
 *
 * Empty until a story has rendered inside StoryOfTheApp, and empty again once it unmounts.
 */
export function componentNamesByNativeTag(): ComponentNamesByNativeTag {
  const names: ComponentNamesByNativeTag = new Map();
  const story = storyOfTheApp;

  // The story itself names nothing - the walk starts at what it draws, so Sherlo's own wrapper is
  // never mistaken for one of the app's components.
  if (story) forEachFiberUnder(story, (fiber) => collectComponentNames(fiber, [], names));

  return names;
}

/* ========================================================================== */

/**
 * Walk one fiber and everything drawn under it, carrying down the names of the components on the
 * way. A native view keeps the names it was handed, then hands its own children none: the view
 * itself is what now stands between them and the app's components.
 */
function collectComponentNames(
  fiber: RenderedFiber,
  namesAbove: string[],
  names: ComponentNamesByNativeTag
): void {
  if (typeof fiber.type === 'string') {
    const nativeTag = nativeTagOf(fiber);
    if (nativeTag !== undefined) names.set(nativeTag, namesAbove);
    forEachFiberUnder(fiber, (child) => collectComponentNames(child, [], names));
    return;
  }

  const name = componentName(fiber.type);
  forEachFiberUnder(fiber, (child) =>
    collectComponentNames(child, name === undefined ? namesAbove : [...namesAbove, name], names)
  );
}

/** Everything hanging under one fiber: its first child, and each child's next sibling. */
function forEachFiberUnder(fiber: RenderedFiber, visit: (child: RenderedFiber) => void): void {
  for (let child = fiber.child; child; child = child.sibling) visit(child);
}

/** The name a component carries, or nothing when the bundle this app was built into kept none. */
function componentName(type: unknown): string | undefined {
  const component = type as { displayName?: unknown; name?: unknown } | null | undefined;

  if (typeof component?.displayName === 'string' && component.displayName) {
    return component.displayName;
  }
  if (typeof component?.name === 'string' && component.name) return component.name;
  return undefined;
}

/** The native view a fiber draws, as React tagged it - the id the inspector reports for it. */
function nativeTagOf(fiber: RenderedFiber): number | undefined {
  const host = fiber.stateNode as
    | { _nativeTag?: unknown; canonical?: { nativeTag?: unknown } }
    | null
    | undefined;

  // The old architecture tags the view itself; the new one keeps the tag on the canonical node.
  const nativeTag = host?._nativeTag ?? host?.canonical?.nativeTag;
  return typeof nativeTag === 'number' ? nativeTag : undefined;
}
