import { ReactElement, useEffect } from 'react';
import SherloModule from '../SherloModule';
import { StorybookParams, StorybookView } from '../types';
import { TestingMode } from './components';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import useStorybookEventListener from './hooks/useStorybookEventListener';

function getStorybook(view: StorybookView, params?: StorybookParams): () => ReactElement {
  return () => {
    useHideSplashScreen();
    useStorybookEventListener();

    // Log that Storybook is initialized
    useEffect(() => {
      console.log('[SHERLO:getStorybook] Storybook initialized - mock transformation will happen during Metro bundling');
    }, []);

    const mode = SherloModule.getMode();

    if (mode === 'testing') {
      return (
        <SafeAreaProvider>
          <TestingMode view={view} params={params} />
        </SafeAreaProvider>
      );
    }

    const Storybook = getStorybookComponent({ view, params });

    return <Storybook />;
  };
}

export default getStorybook;
