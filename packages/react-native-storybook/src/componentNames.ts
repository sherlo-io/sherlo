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

import type { RenderedFiber } from './sealedCore/seam';

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
