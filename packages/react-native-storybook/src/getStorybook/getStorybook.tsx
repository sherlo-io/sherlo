import { ReactElement } from 'react';
import { SherloModule } from '../helpers';
import { StorybookParams, StorybookView } from '../types';
import { TestingMode } from './components';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function getStorybook(view: StorybookView, params?: StorybookParams): () => ReactElement {
  return () => {
    useHideSplashScreen();

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
