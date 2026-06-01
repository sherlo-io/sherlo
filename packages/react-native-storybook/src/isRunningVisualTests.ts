import SherloModule from './SherloModule';

/**
 * `true` when Sherlo is running automated visual tests on a simulator.
 *
 * Use this to disable animations, mock network data, or apply other
 * deterministic behavior during visual test runs.
 *
 * Captured ONCE at module-import time from the native Sherlo module. Does NOT
 * react to runtime mode changes during the same session - reload the bundle
 * to refresh.
 */
const isRunningVisualTests = SherloModule.getMode() === 'testing';

export default isRunningVisualTests;
