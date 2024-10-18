import { NativeModules } from 'react-native';

const { SherloModule } = NativeModules;

const isRunningStorybook = ['storybook', 'testing', 'verification'].includes(
  SherloModule?.getConstants().mode
);

export default isRunningStorybook;
