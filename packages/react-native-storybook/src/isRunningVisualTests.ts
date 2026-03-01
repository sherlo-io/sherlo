import SherloModule from './SherloModule';

/**
 * True when Sherlo is running automated visual tests on a device/simulator.
 *
 * Only true for `'testing'` mode - not set when the user opens Storybook
 * manually via Dev Menu or `openStorybook()`.
 *
 * Use this to disable animations, mock network data, or apply other
 * deterministic behavior during visual test runs.
 */
const isRunningVisualTests = SherloModule.getMode() === 'testing';

export default isRunningVisualTests;
