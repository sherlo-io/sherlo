import isRunningStorybook from './isRunningStorybook';

const shouldShowStorybook = (isStorybookBuild?: boolean) => {
  return isStorybookBuild || isRunningStorybook;
};

export default shouldShowStorybook;
