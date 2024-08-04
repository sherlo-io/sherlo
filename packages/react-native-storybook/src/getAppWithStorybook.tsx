import { ReactElement, useEffect, useState } from 'react';
import { DevSettings, NativeModules } from 'react-native';
import { isExpoGo, SherloModule } from './helpers';
import { passSetModeToOpenStorybook } from './openStorybook';
import { AppOrStorybookMode } from './types';

const { RNSherlo } = NativeModules;

/**
 * This function returns either the App or Storybook component based on the
 * current mode. If Sherlo or Storybook is enabled, it renders the Storybook
 * component, otherwise it renders the App component.
 */
function getAppWithStorybook({
  App,
  Storybook,
}: {
  App: () => ReactElement;
  Storybook: () => ReactElement;
}): () => ReactElement {
  return () => {
    /**
     * Depending on `appOrStorybookMode`, the following mode is returned:
     * - by default, returns App
     * - if running on Sherlo servers, returns Storybook
     * - if toggled Storybook via Dev Menu or openStorybook(), returns the selected mode
     * - on reload, returns the last selected mode
     */
    const { appOrStorybookMode } = SherloModule;

    const [expoGoMode, setExpoGoMode] = useState<AppOrStorybookMode | null>(null);

    const setMode = async (mode: AppOrStorybookMode | 'toggle') => {
      let newMode: AppOrStorybookMode;
      if (mode === 'toggle') {
        newMode = appOrStorybookMode === 'app' ? 'storybook' : 'app';
      } else {
        newMode = mode;
      }

      if (!isExpoGo) {
        /**
         * This approach ensures that the last selected mode (App or Storybook)
         * is remembered and restored after a reload. Additionally, it resolves
         * rendering issues when switching between App and Storybook by
         * restarting the app during mode changes.
         */

        if (newMode === appOrStorybookMode) return;

        if (newMode === 'storybook') {
          console.log('openStorybook() called');
          RNSherlo.openStorybook();
        } else {
          console.log('closeStorybook() called');
          RNSherlo.closeStorybook();
        }
      } else {
        /**
         * For Expo Go, use a simpler method due to lack of native module access
         */

        if (newMode === expoGoMode) return;

        setExpoGoMode(newMode);
      }
    };

    useEffect(() => {
      (async () => {
        if (__DEV__) {
          addToggleStorybookToDevMenu();
        }

        passSetModeToOpenStorybook(setMode);
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (appOrStorybookMode === 'storybook' || expoGoMode === 'storybook') {
      return <Storybook />;
    }

    return <App />;
  };
}

export default getAppWithStorybook;

/* ========================================================================== */

let ExpoDevMenu: any;
try {
  ExpoDevMenu = require('expo-dev-menu');
} catch {}

function addToggleStorybookToDevMenu() {
  // if (ExpoDevMenu) {
  //   ExpoDevMenu.registerDevMenuItems([
  //     {
  //       name: 'Open Storybook',
  //       callback: () => RNSherlo.openStorybook(),
  //     },
  //     {
  //       name: 'Close Storybook',
  //       callback: () => RNSherlo.closeStorybook(),
  //     },
  //   ]);
  // }

  DevSettings.addMenuItem('Open Storybook', () => RNSherlo.openStorybook(false));
  DevSettings.addMenuItem('Open Storybook - Single Activity', () => RNSherlo.openStorybook(true));
  DevSettings.addMenuItem('Close Storybook', () => RNSherlo.closeStorybook());
}
