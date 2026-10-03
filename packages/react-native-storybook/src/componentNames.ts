/**
 * THE TOP OF THE APP'S STORY, kept for the sealed core's walk of the app's component names.
 *
 * A capture prints, beside every native view, the names of the app's components that render it.
 * The names live on the fibers the app is rendered from, and a capture is plain JavaScript with no
 * component of its own: the one component that renders the story (./storyOfTheApp) publishes the
 * fiber it renders from here, and the core reads it through its host (`storyOfTheAppFiber`) and
 * walks the tree under it itself, while it captures. The SDK never walks it. This file keeps no
 * React.
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

/** The top of the app's story, or nothing before it has been rendered. */
let storyOfTheApp: RenderedFiber | undefined;

/**
 * The app's story is on screen, rendered from this fiber; `undefined` forgets it. Called by
 * StoryOfTheApp while it is mounted, and by the tests that walk a fiber tree of their own.
 */
export function rememberStoryOfTheApp(fiber: RenderedFiber | undefined): void {
  storyOfTheApp = fiber;
}

/** The top of the app's story, or nothing before it has been rendered. */
export function storyOfTheAppFiber(): RenderedFiber | undefined {
  return storyOfTheApp;
}
