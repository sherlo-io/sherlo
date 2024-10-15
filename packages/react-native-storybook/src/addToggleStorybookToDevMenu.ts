import { DevSettings } from 'react-native';
import { SherloModule } from './helpers';

/* ========================================================================== */

let ExpoDevMenu: any;
try {
  ExpoDevMenu = require('expo-dev-menu');
} catch {}

let devMenuToggleInitialized = false;

function addToggleStorybookToDevMenu() {
  if (!__DEV__ || devMenuToggleInitialized) return;

  const MENU_LABEL = 'Toggle Storybook';
  const toggleStorybook = () => SherloModule.toggleStorybook();

  DevSettings.addMenuItem(MENU_LABEL, toggleStorybook);

  if (ExpoDevMenu) {
    ExpoDevMenu.registerDevMenuItems([{ name: MENU_LABEL, callback: toggleStorybook }]);
  }

  devMenuToggleInitialized = true;
}

export default addToggleStorybookToDevMenu;

// public fun handleReloadJS()

// public fun reloadJSFromServer(bundleURL: String, callback: BundleLoadCallback)
