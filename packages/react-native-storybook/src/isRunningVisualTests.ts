import SherloModule from './SherloModule';

const isRunningVisualTests = SherloModule.getMode() === 'testing';

export default isRunningVisualTests;
