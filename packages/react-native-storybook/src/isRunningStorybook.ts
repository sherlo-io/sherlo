import { NativeModules } from 'react-native';

const { SherloModule } = NativeModules;

const isRunningVisualTests = SherloModule?.getConstants().mode === 'storybook';

export default isRunningVisualTests;
