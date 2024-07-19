import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import { AppState, AppStateStatus, DevSettings, Platform } from 'react-native';
import { isSherloServer } from './helpers';
import { passSetModeToOpenStorybook } from './openStorybook';
import { AppOrStorybookMode, StorybookParams, StorybookWithSherlo } from './types';

/**
 * Storage - uzywamy do trzymania odpowiedniego mode'u do wyswietlenia podczas RELOAD'u appki
 */

/**
 * Function that returns the given App or Storybook component. If Sherlo or
 * Storybook is enabled, it renders the Storybook component, otherwise it
 * renders the App component.
 */
function getAppWithStorybook({
  App,
  Storybook,
}: {
  App: React.ComponentType<any>;
  Storybook: StorybookWithSherlo;
}): () => ReactElement {
  return () => {
    const [visibleMode, setVisibleMode] = useState<AppOrStorybookMode>('app');

    const { storage } = Storybook;
    const getStorageMode = useCallback(
      () => storage?.getItem(MODE_STORAGE_KEY) as Promise<AppOrStorybookMode | null> | undefined,
      [storage]
    );
    const setStorageMode = useCallback(
      (newMode: AppOrStorybookMode) => storage?.setItem(MODE_STORAGE_KEY, newMode),
      [storage]
    );

    const setVisibleAndStorageMode = useCallback(
      (mode: AppOrStorybookMode | 'toggle') => {
        setVisibleMode((prevMode) => {
          let newMode: AppOrStorybookMode;
          if (mode === 'toggle') {
            newMode = prevMode === 'app' ? 'storybook' : 'app';
          } else {
            newMode = mode;
          }

          setStorageMode(newMode);
          return newMode;
        });
      },
      [setStorageMode]
    );

    useInitialize({ getStorageMode, setVisibleMode, setVisibleAndStorageMode });

    usePersistModeWhileHotReload({ visibleMode, storage });

    useEffect(() => {
      passSetModeToOpenStorybook(setVisibleAndStorageMode);
    }, [setVisibleAndStorageMode]);

    if (visibleMode === 'storybook') return <Storybook />;

    return <App />;
  };
}

export default getAppWithStorybook;

/* ========================================================================== */

const MODE_STORAGE_KEY = 'sherloPersistedMode';

function useInitialize({
  getStorageMode,
  setVisibleAndStorageMode,
  setVisibleMode,
}: {
  getStorageMode: () => Promise<AppOrStorybookMode | null> | undefined;
  setVisibleAndStorageMode: (newMode: AppOrStorybookMode | 'toggle') => void;
  setVisibleMode: (value: React.SetStateAction<AppOrStorybookMode>) => void;
}) {
  useEffect(
    () => {
      (async () => {
        if (await isSherloServer()) {
          /**
           * The app has been run on Sherlo server - turn Storybook to start testing
           */

          setVisibleMode('storybook');
        } else if (__DEV__) {
          /**
           * The app has been run in development mode - get persisted mode or set App
           */

          // We use storage mode while app resets - works only on iOS
          const storageMode = Platform.OS === 'android' ? null : await getStorageMode();
          setVisibleMode(storageMode ?? 'app');

          addToggleStorybookToDevMenu(setVisibleAndStorageMode);
        } else {
          /**
           * The app has been run on production - show App
           */

          setVisibleMode('app');
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
}

function addToggleStorybookToDevMenu(
  setStateAndStorageMode: (newMode: AppOrStorybookMode | 'toggle') => void
) {
  if (!__DEV__) return;

  const TOGGLE_STORYBOOK_DEV_MENU_ITEM_NAME = 'Toggle Storybook';
  const toggleBetweenAppAndStorybook = () => setStateAndStorageMode('toggle');

  let ExpoDevMenu: any;
  try {
    ExpoDevMenu = require('expo-dev-menu');
  } catch {}

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

/**
 * Persists App or Storybook mode while hot reloading the code
 */
// TODO: zla nazwa -> WhileForeground/Background ???
function usePersistModeWhileHotReload({
  storage,
  visibleMode,
}: {
  storage: StorybookParams['storage'];
  visibleMode: AppOrStorybookMode;
}) {
  useEffect(
    () => {
      // TODO: Right now persisted mode doesn't work on Android
      if (Platform.OS === 'android') return;

      const handleAppStateChange = (appState: AppStateStatus) => {
        const isAppActive = appState === 'active';

        if (isAppActive) {
          storage?.setItem(MODE_STORAGE_KEY, visibleMode);
        } else {
          storage?.setItem(MODE_STORAGE_KEY, 'app');
        }
      };

      const subscription = AppState.addEventListener('change', handleAppStateChange);

      return () => subscription.remove();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleMode]
  );
}
