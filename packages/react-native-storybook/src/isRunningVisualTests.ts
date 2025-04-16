import { SherloModule } from './helpers';

const isRunningVisualTests = SherloModule.getMode() === 'testing';

export default isRunningVisualTests;
