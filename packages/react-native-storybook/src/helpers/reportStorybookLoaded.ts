import { send } from '../connection/appLine';
import SherloModule from '../SherloModule';

/**
 * Tells the runner the app can take a story: the runner sends the story to show only once it hears
 * this (or the hello carried a JavaScript version). The Storybook road sends it after its first
 * render commits (./getStorybook/getStorybook), an app of scenes and no Storybook when its session
 * starts (./sceneBoot). Outside testing mode it sends nothing.
 */
export default function reportStorybookLoaded(): void {
  try {
    if (SherloModule.getMode() === 'testing') {
      send({ action: 'STORYBOOK_LOADED' });
    }
  } catch (_e) {
    // The line is not up: the runner then learns the app's state from its hello.
  }
}
