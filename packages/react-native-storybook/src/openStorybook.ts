import { NativeModules } from 'react-native';
import { AppOrStorybookMode } from './types';

const { RNSherlo } = NativeModules;

function openStorybook(): void {
  RNSherlo.openStorybook(false);
  // if (setMode) {
  //   setMode('storybook');
  // } else {
  //   throw new Error(
  //     'If you want to use `openStorybook()`, you need to wrap your application with `getAppWithStorybook()`.\n\nLearn more: https://docs.sherlo.io/getting-started/setup?storybook-entry-point=integrated#storybook-entry-point'
  //   );
  // }
}

type SetMode = (mode: AppOrStorybookMode) => void;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let setMode: SetMode;
export function passSetModeToOpenStorybook(setModeFn: SetMode): void {
  setMode = setModeFn;
}

export default openStorybook;
