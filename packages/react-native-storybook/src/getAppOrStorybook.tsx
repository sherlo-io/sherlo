import React, { ReactElement, useEffect, useState } from 'react';
import { AppState, AppStateStatus, DevSettings, Platform } from 'react-native';
import { AppOrStorybookModeContext } from './contexts';
import { runnerBridge } from './helpers';
import { AppOrStorybookMode, StorybookParams } from './types';

/**
 * Function that returns the given App or Storybook component. If Sherlo or
 * Storybook is enabled, it renders the Storybook component, otherwise it
 * renders the App component.
 */
function getAppOrStorybook({
  App,
  Storybook,
}: {
  App: React.ComponentType<any>;
  Storybook: () => ReactElement;
}): () => ReactElement {
  return () => {
    const [mode, setMode] = useState<AppOrStorybookMode>('app');

    // We don't want to contain storage in parameter type itself because it breaks
    // the way typescript considers Storybook as ReactElement when rendering JSX.
    const { storage } = Storybook as { storage?: StorybookParams['storage'] };

    useEffect(() => {
      if (Platform.OS !== 'android') {
        // Register AppState listener to persist mode if app is not in background
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
          if (nextAppState === 'inactive') {
            storage?.setItem(MODE_STORAGE_KEY, 'app');
          } else if (nextAppState === 'active') {
            storage?.setItem(MODE_STORAGE_KEY, mode);
          }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
          subscription.remove();
        };
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    useEffect(() => {
      runnerBridge
        .getConfig()
        .then(() => {
          setMode('storybook');
        })
        .catch(() => {
          if (__DEV__ && Platform.OS !== 'android') {
            // Get stored mode from storage
            storage?.getItem(MODE_STORAGE_KEY).then((sherloPersistedMode) => {
              if (sherloPersistedMode === 'storybook' || sherloPersistedMode === 'app') {
                setMode(sherloPersistedMode);
              }
            });
          } else {
            setMode('app');
          }
        });

      addToggleStorybookToDevMenu({ setMode, storage });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <AppOrStorybookModeContext.Provider
        value={{
          mode,
          setMode: (newMode) => {
            setMode(newMode);
            storage?.setItem(MODE_STORAGE_KEY, newMode);
          },
        }}
      >
        {mode === 'app' ? <App /> : <Storybook />}
      </AppOrStorybookModeContext.Provider>
    );
  };
}

export default getAppOrStorybook;

/* ========================================================================== */

const MODE_STORAGE_KEY = 'sherloPersistedMode';
const TOGGLE_STORYBOOK_DEV_MENU_ITEM_NAME = 'Toggle Storybook';

let ExpoDevMenu: any;
try {
  ExpoDevMenu = require('expo-dev-menu');
} catch (error) {
  // Optional module is not installed
}

function addToggleStorybookToDevMenu({
  setMode,
  storage,
}: {
  setMode: (value: React.SetStateAction<AppOrStorybookMode>) => void;
  storage: StorybookParams['storage'] | undefined;
}) {
  if (!__DEV__) return;

  const toggleBetweenAppAndStorybook = () => {
    setMode((prevMode) => {
      const newMode = prevMode === 'app' ? 'storybook' : 'app';

      setMode(newMode);
      storage?.setItem(MODE_STORAGE_KEY, newMode);
      return newMode;
    });
  };

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
