import { NativeModules } from 'react-native';

const { SherloModule } = NativeModules;

const isRunningVisualTests = SherloModule?.getConstants().mode === 'testing';

export default isRunningVisualTests;
