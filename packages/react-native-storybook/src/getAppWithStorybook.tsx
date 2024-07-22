import { ReactElement, useEffect, useState } from 'react';
import { DevSettings } from 'react-native';
import { isSherloServer, SherloModule } from './helpers';
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
}): () => ReactElement | null {
  return () => {
    const [visibleMode, setVisibleMode] = useState<AppOrStorybookMode | null>('app');
    const [pendingMode, setPendingMode] = useState<AppOrStorybookMode | null>(null);

    const setMode = (mode: AppOrStorybookMode | 'toggle') => {
      setVisibleMode((prevMode) => {
        let newMode: AppOrStorybookMode;
        if (mode === 'toggle') {
          newMode = prevMode === 'app' ? 'storybook' : 'app';
        } else {
          newMode = mode;
        }

        if (newMode === prevMode) {
          /**
           * Simply return previous mode if it didn't change
           */

          return prevMode;
        } else {
          /**
           * If the mode has changed, temporarily set visibleMode to `null` and
           * set the new mode as pending. This ensures a one cycle pause to
           * avoid rendering issues on Android emulators during the transition
           * between `app` and `storybook` modes.
           */

          SherloModule.setAppOrStorybookMode(newMode); // Persist the new mode for future app restarts
          setPendingMode(newMode); // Set the new mode as pending
          return null; // Temporarily set visibleMode to null
        }
      });
    };

    useEffect(() => {
      if (pendingMode !== null) {
        /**
         * If pendingMode is defined, set it as the visible mode.
         * At this point, we know the render cycle has completed rendering
         * `null`, so we can safely set the target mode, preventing rendering
         * issues on Android emulators.
         */

        setVisibleMode(pendingMode);
        setPendingMode(null);
      }
    }, [pendingMode]);

    useEffect(() => {
      (async () => {
        if (await isSherloServer()) {
          /**
           * If the app is running on a Sherlo server, switch to Storybook
           * mode for testing
           */

          setMode('storybook');
        } else if (__DEV__) {
          /**
           * If the app is running in development mode, retrieve the last
           * selected mode if the app was reset, otherwise default to the App
           */

          const selectedModeBeforeReset = await SherloModule.getAppOrStorybookMode();
          setMode(selectedModeBeforeReset ?? 'app');

          addToggleStorybookToDevMenu(setMode);
        } else {
          /**
           * If the app is running in production mode, display the App
           */

          setMode('app');
        }
      })();
    }, []);

    useEffect(() => {
      passSetModeToOpenStorybook(setMode);
    }, []);

    if (visibleMode === null) return null;

    if (visibleMode === 'storybook') return <Storybook />;

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
