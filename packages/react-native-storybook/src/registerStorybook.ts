import { ReactElement } from 'react';
import { AppRegistry, DevSettings } from 'react-native';
import { SherloModule } from './helpers';
import { handleAsyncError } from './utils';

let ExpoDevMenu: any;
try {
  ExpoDevMenu = require('expo-dev-menu');
} catch {}

function registerStorybook(StorybookComponent: () => ReactElement) {
  AppRegistry.registerComponent('SherloStorybook', () => StorybookComponent);

  addToggleStorybookToDevMenu();

  SherloModule.storybookRegistered();
}
export default registerStorybook;

/* ========================================================================== */

let hasAddedDevMenuItem = false;

function addToggleStorybookToDevMenu() {
  // Add menu item once in development build
  if (!__DEV__ || hasAddedDevMenuItem) return;

  const MENU_LABEL = 'Toggle Storybook';
  const toggleStorybook = () => {
    SherloModule.toggleStorybook().catch(handleAsyncError);
  };

  DevSettings.addMenuItem(MENU_LABEL, toggleStorybook);

  if (ExpoDevMenu) {
    ExpoDevMenu.registerDevMenuItems([{ name: MENU_LABEL, callback: toggleStorybook }]);
  }

  hasAddedDevMenuItem = true;
}
