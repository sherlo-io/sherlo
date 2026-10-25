/**
 * THE ONE DECISION that a launch is a capture of a scene of an app with its own Storybook: the
 * scene boot (./sceneBoot) asks the bundler's line for the capture, and the app's root wrapper
 * (./storyOfTheApp) wraps the root in the scene's view, on this answer and no other.
 *
 * It is a capture when the launch names a story id that is one of the bundle's scenes, Storybook
 * has recorded its facts, and no runner drives the launch (./runnerWalk). A story's id is not a
 * scene's, so an app that shows a story is never wrapped, whenever its Storybook starts.
 */
import SherloModule from './SherloModule';
import bundledScenes from './bundledScenes';
import { readStorybookFacts } from './getStorybook/storybookFacts';
import { isDrivenByRunner } from './runnerWalk';

/** The scene this launch captures, or undefined when the launch is not such a capture. */
export function sceneOfTheCaptureOfAnAppWithStorybook(): string | undefined {
  if (SherloModule.getMode() !== 'testing') return undefined;
  const id = SherloModule.getLastState()?.nextSnapshot.storyId;
  if (!id || !bundledScenes[id]) return undefined;
  if (readStorybookFacts() === null || isDrivenByRunner()) return undefined;
  return id;
}
