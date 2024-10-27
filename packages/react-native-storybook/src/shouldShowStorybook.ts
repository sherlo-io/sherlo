import isRunningStorybook from './isRunningStorybook';

/**
 * shouldShowStorybook determines whether to show Storybook.
 *
 * Returns true if any of the following conditions are met:
 * 1. isStorybookBuild is true
 * 2. User selected "Toggle Storybook" in Dev Menu
 * 3. User called "openStorybook" function imported from "@sherlo/react-native-storybook"
 * 4. Build is running tests on Sherlo
 */
const shouldShowStorybook = (isStorybookBuild?: boolean) => {
  return isStorybookBuild || isRunningStorybook;
};

export default shouldShowStorybook;
