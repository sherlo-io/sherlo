import { AppOrStorybookMode } from './types';

// TODO: czy tez trzeba zapisywac do storage? -> chyba tak bo w SB podczas hotreload wywaliloby do appki
function openStorybook(): void {
  if (setMode) {
    setMode('storybook');
  } else {
    throw new Error(
      'If you want to use `openStorybook()`, you need to wrap your application with `getAppWithStorybook()`.\n\nLearn more: https://docs.sherlo.io/getting-started/setup?storybook-entry-point=integrated#storybook-entry-point'
    );
  }
}

type SetMode = (mode: AppOrStorybookMode) => void;

let setMode: SetMode;
export function passSetModeToOpenStorybook(setModeFn: SetMode): void {
  setMode = setModeFn;
}

export default openStorybook;
