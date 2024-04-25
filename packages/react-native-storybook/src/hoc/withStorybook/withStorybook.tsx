import React, { ReactElement, useEffect, useState } from 'react';
import { AppState, AppStateStatus, DevSettings, Platform } from 'react-native';
import * as DevMenu from 'expo-dev-menu';

import { TOGGLE_STORYBOOK_DEV_SETTINGS_MENU_ITEM } from '../../data/constants';
import { StorybookParams } from '../../types';
import ModeProvider from './ModeProvider';
import runnerBridge from '../../runnerBridge/runnerBridge';

const MODE_STORAGE_KEY = 'sherloPersistedMode';

export type WithStorybookMode = 'app' | 'storybook';

/**
 * Higher-order component that wraps the given App and Storybook components.
 * If Sherlo or Storybook is enabled, it renders the Storybook component, otherwise it renders the App component.
 * @param {React.ComponentType<any>} App - The main application component.
 * @param {() => ReactElement} Storybook - The Storybook component.
 * @returns {() => ReactElement} A new component that conditionally renders either the App or Storybook component.
 */
const withStorybook =
  (App: React.ComponentType<any>, Storybook: () => ReactElement) => (): ReactElement => {
    const [mode, setMode] = useState<WithStorybookMode>('app');

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

      if (__DEV__) {
        // Add Dev Menu item to toggle between app and storybook
        const callback = () => {
          setMode((prevMode) => {
            const newMode = prevMode === 'app' ? 'storybook' : 'app';

            setMode(newMode);
            storage?.setItem(MODE_STORAGE_KEY, newMode);
            return newMode;
          });
        };

        if (DevMenu) {
          DevMenu.registerDevMenuItems([
            {
              name: TOGGLE_STORYBOOK_DEV_SETTINGS_MENU_ITEM,
              callback,
              shouldCollapse: false,
            },
          ]);
        } else {
          DevSettings.addMenuItem(TOGGLE_STORYBOOK_DEV_SETTINGS_MENU_ITEM, callback);
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <ModeProvider
        mode={mode}
        setMode={(newMode) => {
          setMode(newMode);
          storage?.setItem(MODE_STORAGE_KEY, newMode);
        }}
      >
        {mode !== 'app' ? <Storybook /> : <App />}
      </ModeProvider>
    );
  };

export default withStorybook;
