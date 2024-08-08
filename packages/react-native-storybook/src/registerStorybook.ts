import { ReactElement } from 'react';
import { AppRegistry, DevSettings } from 'react-native';
import { SherloModule } from './helpers';

function registerStorybook(StorybookComponent: () => ReactElement) {
  AppRegistry.registerComponent('SherloStorybook', () => StorybookComponent);

  addToggleStorybookToDevMenu();
}

export default registerStorybook;

/* ========================================================================== */

let ExpoDevMenu: any;
try {
  ExpoDevMenu = require('expo-dev-menu');
} catch {}

function addToggleStorybookToDevMenu() {
  // Only add the menu item in development builds
  if (!__DEV__) return;

  const MENU_LABEL = 'Toggle Storybook';
  const toggleStorybook = () => SherloModule.toggleStorybook();

  DevSettings.addMenuItem(MENU_LABEL, toggleStorybook);

  if (ExpoDevMenu) {
    ExpoDevMenu.registerDevMenuItems([{ name: MENU_LABEL, callback: toggleStorybook }]);
  }
}
