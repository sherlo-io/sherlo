import { NativeModules } from 'react-native';

const { SherloModule } = NativeModules;

const isRunningStorybook = ['storybook', 'testing'].includes(SherloModule?.getConstants().mode);

export default isRunningStorybook;
