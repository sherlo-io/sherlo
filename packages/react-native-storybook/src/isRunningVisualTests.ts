import { NativeModules } from 'react-native';

const { SherloModule } = NativeModules;

const isRunningVisualTests = SherloModule?.getConstants().initialMode === 'testing';

export default isRunningVisualTests;
