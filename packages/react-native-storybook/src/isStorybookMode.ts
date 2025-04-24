import SherloModule from './SherloModule';

/**
 * isStorybookMode determines whether Storybook should be displayed.
 *
 * Returns true if any of the following conditions are met:
 * 1. User selected "Toggle Storybook" in Dev Menu
 * 2. User called "openStorybook" function imported from "@sherlo/react-native-storybook"
 * 3. Build is running tests on Sherlo
 */
const isStorybookMode = ['storybook', 'testing'].includes(SherloModule.getMode());

export default isStorybookMode;
