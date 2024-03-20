import React, { ReactElement, useEffect, useState } from 'react';
import { DevSettings } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOGGLE_STORYBOOK_DEV_SETTINGS_MENU_ITEM } from '../../data/constants';
import { Mode } from '../withSherlo/withSherlo';
import { configPath } from '../../runnerBridge';
import { getConfig } from '../../runnerBridge/actions';
import { getGlobalStates } from '../../utils';
import ModeProvider from './ModeProvider';

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
            AsyncStorage.getItem('sherloPersistedMode').then((sherloPersistedMode) => {
              if (sherloPersistedMode === 'original') {
                setMode('original');
              }
            });
          });
      };

      checkIfSherloIsEnabled();
    }, []);

    /**
     * Adds a menu item to toggle Storybook in the development settings menu.
     */
    useEffect(() => {
      if (__DEV__) {
        DevSettings.addMenuItem(TOGGLE_STORYBOOK_DEV_SETTINGS_MENU_ITEM, () => {
          setMode((prevMode) => {
            const newMode = prevMode === 'app' ? 'original' : 'app';
            AsyncStorage.setItem('sherloPersistedMode', newMode);
            return newMode;
          });
        });
      }
    }, []);

    if (mode !== 'app') {
      return (
        <ModeProvider mode={mode}>
          <Storybook />
        </ModeProvider>
      );
    }

    return <App />;
  };

export default withStorybook;
