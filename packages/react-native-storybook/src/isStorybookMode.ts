import SherloModule from './SherloModule';

/**
 * True when the app should display Storybook instead of the normal UI.
 *
 * Returns true when SherloModule mode is `'storybook'` or `'testing'`:
 * - `'storybook'` - User selected "Toggle Storybook" in Dev Menu or called `openStorybook()`
 * - `'testing'` - Sherlo is running automated visual tests on a simulator
 */
const isStorybookMode = ['storybook', 'testing'].includes(SherloModule.getMode());

export default isStorybookMode;
