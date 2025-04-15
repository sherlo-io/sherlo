export { default as addStorybookToDevMenu } from './addStorybookToDevMenu';
export { default as getStorybook } from './getStorybook';
export { default as isRunningVisualTests } from './isRunningVisualTests';
export { default as isStorybookMode } from './isStorybookMode';
export { default as openStorybook } from './openStorybook';

// Add debug code to log TurboModule initialization
import SherloTurbo from './specs/NativeSherloTurbo';

if (SherloTurbo) {
  const result = SherloTurbo.hello('Sherlo');
  console.log(result);
} else {
  console.warn('SherloTurbo module is not available');
}

export * from './types';
