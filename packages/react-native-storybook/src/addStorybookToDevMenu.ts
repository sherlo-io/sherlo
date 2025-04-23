import { DevSettings } from 'react-native';
import { SherloModule } from './helpers';

let devMenuToggleInitialized = false;

let ExpoDevMenu: any;
try {
  ExpoDevMenu = require('expo-dev-menu');
} catch {}

function addStorybookToDevMenu() {
  if (!__DEV__ || devMenuToggleInitialized) return;

  const MENU_LABEL = 'Toggle Storybook';
  const toggleStorybook = () => SherloModule.toggleStorybook();

  DevSettings.addMenuItem(MENU_LABEL, toggleStorybook);

  if (ExpoDevMenu?.registerDevMenuItems) {
    // TODO: Expo Bug present only on New Arch
    //
    // 1. Open the dev menu
    // 2. Select custom dev menu item
    // Result: it behaves as expected
    // 3. Choose "reload"
    // 4. Again select custom dev menu item
    // Result: it doesn't respond
    //
    // The same thing happens if we choose "Toggle Storybook" from the dev menu because
    // it reloads the app as a part of it's functionality. Because of that, once
    // user enters Storybook mode, they cannot leave by selecting "Toggle Storybook"
    // from the dev menu again.
    ExpoDevMenu.registerDevMenuItems([{ name: MENU_LABEL, callback: toggleStorybook }]);
  }

  devMenuToggleInitialized = true;
}

export default addStorybookToDevMenu;
