import SherloModule from './SherloModule';

/**
 * True when Sherlo is running automated visual tests on a simulator.
 *
 * Use this to disable animations, mock network data, or apply other
 * deterministic behavior during visual test runs.
 */
const isRunningVisualTests = SherloModule.getMode() === 'testing';

export default isRunningVisualTests;
