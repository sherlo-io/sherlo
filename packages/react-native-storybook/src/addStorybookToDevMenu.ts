import { DevSettings, Platform } from 'react-native';
import SherloModule from './SherloModule';

let devMenuToggleInitialized = false;

let ExpoDevMenu: any;
try {
  ExpoDevMenu = require('expo-dev-menu');
} catch {}

function addStorybookToDevMenu() {
  if (!__DEV__ || devMenuToggleInitialized) return;

  // Expo Bug present only on iOS in New Arch where custom dev menu items registered via registerDevMenuItems stop responding after a reload
  // https://github.com/expo/expo/issues/36359
  //
  // The same thing happens if we choose "Toggle Storybook" from the dev menu because
  // it reloads the app as a part of it's functionality. Because of that, once
  // user enters Storybook mode, they cannot leave by selecting "Toggle Storybook"
  // from the dev menu again.
  //
  // That's why we keep a workaround until this is fixed
  const useOpenStorybookWorkaroundInExpoDevMenuItem =
    SherloModule.isTurboModule && Platform.OS === 'ios';
  const shouldAdExpoDevMenuItem =
    !useOpenStorybookWorkaroundInExpoDevMenuItem || Platform.OS !== 'ios';

  const MENU_LABEL_TOGGLE_STORYBOOK = 'Toggle Storybook';
  const MENU_LABEL_OPEN_STORYBOOK = 'Open Storybook';
  const toggleStorybook = () => SherloModule.toggleStorybook();
  const openStorybook = () => SherloModule.openStorybook();

  DevSettings.addMenuItem(MENU_LABEL_TOGGLE_STORYBOOK, toggleStorybook);

  if (ExpoDevMenu?.registerDevMenuItems && shouldAdExpoDevMenuItem) {
    const devMenuItem = useOpenStorybookWorkaroundInExpoDevMenuItem
      ? { name: MENU_LABEL_OPEN_STORYBOOK, callback: openStorybook }
      : { name: MENU_LABEL_TOGGLE_STORYBOOK, callback: toggleStorybook };
    ExpoDevMenu.registerDevMenuItems([devMenuItem]);
  }

  devMenuToggleInitialized = true;
}

export default addStorybookToDevMenu;
