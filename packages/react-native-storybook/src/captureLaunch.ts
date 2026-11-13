/**
 * THE ONE DECISION that a launch of an app with its own Storybook shows a scene: the app's root
 * wrapper (./storyOfTheApp) wraps the root in the scene's view on this answer and no other, and
 * the scene boot (./sceneBoot) asks the bundler's line for the capture or, when a runner drives the
 * launch (./runnerWalk), hands the scene to the runner's walk.
 *
 * A launch shows a scene when it names an id that is one of the bundle's scenes, Storybook has
 * recorded its facts, and the id is not one of the stories Storybook indexed. The launch does not
 * say scene or story (`-sherloCapture <id>` for both), and a scene's id (`file--name`) can equal a
 * story's (`title--name`): the facts' story index settles it, and an id that is a story stays a
 * story, never wrapped.
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
 * Whether this launch names one of the bundle's scenes, from a bundler or a runner. It is asked at
 * import (./isStorybookMode), before Storybook has started and recorded its facts, so it cannot
 * tell a scene from a story of the same id: that id counts as a scene here, while
 * sceneOfTheLaunchOfAnAppWithStorybook, asked later, leaves it a story.
 */
export function launchNamesABundledScene(): boolean {
  const id = idOfTheTestingLaunch();
  return !!id && !!bundledSceneOfId(id);
}

/**
 * The scene this launch of an app with its own Storybook shows, or undefined when it shows none:
 * an id of the bundle's scenes that is not one of the stories Storybook indexed. Who answers it
 * depends on who drives the launch: a capture (sceneOfTheCaptureOfAnAppWithStorybook) or the
 * runner's walk (./sceneBoot).
 */
export function sceneOfTheLaunchOfAnAppWithStorybook(): string | undefined {
  const id = idOfTheTestingLaunch();
  if (!id || !bundledSceneOfId(id)) return undefined;
  const facts = readStorybookFacts();
  if (facts === null || facts.storyIndex?.[id]) return undefined;
  return id;
}

/** The scene this launch captures, or undefined when the launch is not such a capture. */
export function sceneOfTheCaptureOfAnAppWithStorybook(): string | undefined {
  return isDrivenByRunner() ? undefined : sceneOfTheLaunchOfAnAppWithStorybook();
}
