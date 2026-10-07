// SPIKE (launch-time-entry): with no hands on the simulator, this drives what a person does from
// the developer menu's "Toggle Storybook": the very native call the menu item makes
// (SherloModule.toggleStorybook). Each side calls it once, after 4 seconds, counted in
// AsyncStorage so the walk is app -> Storybook -> app and then stops.
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore - a deep path the SDK exports for its own generated files
import SherloModuleImport from '@sherlo/react-native-storybook/dist/SherloModule.js';

const SherloModule = (SherloModuleImport as any).default ?? SherloModuleImport;
const KEY = 'spike-launch-time-entry-step';

export function spikeToggleOnce(side: 'app' | 'storybook') {
  console.log('SPIKE_LAUNCH side=' + side + ' mode=' + SherloModule.getMode());
  AsyncStorage.getItem(KEY).then((value) => {
    const step = Number(value ?? '0');
    const due = (side === 'app' && step === 0) || (side === 'storybook' && step === 1);
    if (!due) return;
    AsyncStorage.setItem(KEY, String(step + 1)).then(() => {
      setTimeout(() => {
        console.log('SPIKE_TOGGLE from=' + side);
        SherloModule.toggleStorybook();
      }, 4000);
    });
  });
}
