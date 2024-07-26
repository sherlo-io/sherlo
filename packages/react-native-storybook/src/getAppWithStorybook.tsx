import { ReactElement, useEffect, useState } from 'react';
import { DevSettings } from 'react-native';
import { isExpoGo, SherloModule } from './helpers';
import { passSetModeToOpenStorybook } from './openStorybook';
import { AppOrStorybookMode } from './types';

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
     * Depending on `appOrStorybookMode`, the following component is rendered:
     * - by default, returns the App
     * - returns Storybook if running on Sherlo servers
     * - on reload, returns last selected mode: Storybook if the developer was
     *   working on it, or App otherwise
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

        SherloModule.setAppOrStorybookModeAndRestart(newMode);
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
          addToggleStorybookToDevMenu(setMode);
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

function addToggleStorybookToDevMenu(setMode: (newMode: AppOrStorybookMode | 'toggle') => void) {
  const TOGGLE_STORYBOOK_DEV_MENU_ITEM_NAME = 'Toggle Storybook';
  const toggleBetweenAppAndStorybook = () => setMode('toggle');

  if (ExpoDevMenu) {
    ExpoDevMenu.registerDevMenuItems([
      {
        name: TOGGLE_STORYBOOK_DEV_MENU_ITEM_NAME,
        callback: toggleBetweenAppAndStorybook,
      },
    ]);
  }

  DevSettings.addMenuItem(TOGGLE_STORYBOOK_DEV_MENU_ITEM_NAME, toggleBetweenAppAndStorybook);
}
