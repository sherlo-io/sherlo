/**
 * THE ONE DECISION that a launch is a capture of a scene of an app with its own Storybook: the
 * scene boot (./sceneBoot) asks the bundler's line for the capture, and the app's root wrapper
 * (./storyOfTheApp) wraps the root in the scene's view, on this answer and no other.
 *
 * It is a capture when the launch names an id that is one of the bundle's scenes, Storybook has
 * recorded its facts, no runner drives the launch (./runnerWalk), and the id is not one of the
 * stories Storybook indexed. The launch does not say scene or story (`-sherloCapture <id>` for
 * both), and a scene's id (`file--name`) can equal a story's (`title--name`): the facts' story
 * index settles it, and an id that is a story stays a story, never wrapped.
 *
 * This file also holds the only reads of the launch's id and of the bundle's scene entries.
 */
import SherloModule from './SherloModule';
import bundledScenes from './bundledScenes';
import { readStorybookFacts } from './getStorybook/storybookFacts';
import { isDrivenByRunner } from './runnerWalk';

/** The id the launch was handed in testing mode (a scene's or a story's), or undefined. */
export function idOfTheTestingLaunch(): string | undefined {
  if (SherloModule.getMode() !== 'testing') return undefined;
  return SherloModule.getLastState()?.nextSnapshot.storyId || undefined;
}

/** Whether the testing launch has the capture discover: requests no rule names are held, listed. */
export function discoverOfTheTestingLaunch(): boolean {
  if (SherloModule.getMode() !== 'testing') return false;
  return (SherloModule.getLastState() as { discover?: boolean } | undefined)?.discover === true;
}

/** The bundle's scene of this id, or undefined when the bundle holds none. */
export function bundledSceneOfId(id: string): (typeof bundledScenes)[string] | undefined {
  return bundledScenes[id];
}

/** Whether the bundle holds any scene. */
export function bundleHoldsScenes(): boolean {
  return Object.keys(bundledScenes).length > 0;
}

/**
 * Whether this launch names one of the bundle's scenes and no runner drives it. It is asked at
 * import (./isStorybookMode), before Storybook has started and recorded its facts, so it cannot
 * tell a scene from a story of the same id: that id counts as a scene here, while
 * sceneOfTheCaptureOfAnAppWithStorybook, asked later, leaves it a story.
 */
export function launchNamesABundledScene(): boolean {
  const id = idOfTheTestingLaunch();
  return !!id && !!bundledSceneOfId(id) && !isDrivenByRunner();
}

/** The scene this launch captures, or undefined when the launch is not such a capture. */
export function sceneOfTheCaptureOfAnAppWithStorybook(): string | undefined {
  const id = idOfTheTestingLaunch();
  if (!id || !bundledSceneOfId(id)) return undefined;
  const facts = readStorybookFacts();
  if (facts === null || isDrivenByRunner()) return undefined;
  if (facts.storyIndex?.[id]) return undefined;
  return id;
}
