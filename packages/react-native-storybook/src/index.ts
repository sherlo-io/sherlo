export { default as addStorybookToDevMenu } from './addStorybookToDevMenu';
export { default as getStorybook } from './getStorybook';
export { default as getCurrentVariant } from './getCurrentVariant';
// Auto-register the variant tracker addon when this package is imported
import './addons/sherlo-variant-tracker/register';
export { default as isRunningVisualTests } from './isRunningVisualTests';
export { default as isStorybookMode } from './isStorybookMode';
export { default as openStorybook } from './openStorybook';
export { default as SherloModule } from './SherloModule';

export * from './types';
