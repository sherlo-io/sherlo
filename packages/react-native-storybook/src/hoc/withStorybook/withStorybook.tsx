import React, { ReactElement, useEffect, useState } from 'react';
import { AppState, AppStateStatus, DevSettings } from 'react-native';
import * as DevMenu from 'expo-dev-menu';

import { TOGGLE_STORYBOOK_DEV_SETTINGS_MENU_ITEM } from '../../data/constants';
import { configPath } from '../../runnerBridge';
import { getConfig } from '../../runnerBridge/actions';
import { getGlobalStates } from '../../utils';
import ModeProvider, { Mode } from './ModeProvider';
import { StorybookParams } from '../../types';

const MODE_STORAGE_KEY = 'sherloPersistedMode';

/**
 * Higher-order component that wraps the given App and Storybook components.
 * If Sherlo or Storybook is enabled, it renders the Storybook component, otherwise it renders the App component.
 * @param {React.ComponentType<any>} App - The main application component.
 * @param {() => ReactElement} Storybook - The Storybook component.
 * @returns {() => ReactElement} A new component that conditionally renders either the App or Storybook component.
 */
const withStorybook =
  (App: React.ComponentType<any>, Storybook: () => ReactElement) => (): ReactElement => {
    const [mode, setMode] = useState<Mode>('app');

    // We don't want to contain storage in parameter type itself because it breaks
    // the way typescript considers Storybook as ReactElement when rendering JSX.
    const { storage } = Storybook as { storage?: StorybookParams['storage'] };

    useEffect(() => {
      const checkIfSherloIsEnabled = async (): Promise<void> => {
        await getConfig(configPath)()
          .then((config) => {
            if (config !== undefined) {
              if (getGlobalStates().isIntegrationTest) {
                setMode('verification');
              } else {
                setMode('testing');
              }
            }
          })
          .catch(() => {
            if (__DEV__) {
              storage?.getItem(MODE_STORAGE_KEY).then((sherloPersistedMode) => {
                if (sherloPersistedMode === 'original' || sherloPersistedMode === 'app') {
                  setMode(sherloPersistedMode);
                }
              });
            }
          });
      };

      checkIfSherloIsEnabled();
    }, []);

    useEffect(() => {
      if (__DEV__) {
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
    }, [mode]);

    /**
     * Adds a menu item to toggle Storybook in the development settings menu.
     */
    useEffect(() => {
      if (__DEV__) {
        const callback = () => {
          setMode((prevMode) => {
            const newMode = prevMode === 'app' ? 'original' : 'app';

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
    }, []);

    return (
      <ModeProvider mode={mode} setMode={setMode}>
        {mode !== 'app' ? <Storybook /> : <App />}
      </ModeProvider>
    );
  };

export default withStorybook;
