import { ReactElement, useEffect } from 'react';
import SherloModule from '../SherloModule';
import { StorybookParams, StorybookView } from '../types';
import { TestingMode } from './components';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeChannelListener } from '../getCurrentVariant';

function getStorybook(view: StorybookView, params?: StorybookParams): () => ReactElement {
  return () => {
    useHideSplashScreen();

    // Initialize channel listener to track current variant
    // Note: The actual channel listening is handled by the addon registered in storybook.requires.ts
    useEffect(() => {
      initializeChannelListener();
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
