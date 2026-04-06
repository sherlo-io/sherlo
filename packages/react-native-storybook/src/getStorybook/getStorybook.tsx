import { ReactElement, useEffect, useState } from 'react';
import SherloModule from '../SherloModule';
import checkSdkCompatibility from '../checkSdkCompatibility';
import { StorybookParams, StorybookView } from '../types';
import { TestingMode } from './components';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function getStorybook(view: StorybookView, params?: StorybookParams): () => ReactElement {
  const mode = SherloModule.getMode();

  if (mode === 'testing') {
    const delayMs = SherloModule.getConfig().initialStoryRenderDelayMs;
    if (delayMs !== undefined) {
      const originalGetProjectAnnotations = view._preview.getProjectAnnotations.bind(
        view._preview
      );
      view._preview.onGetProjectAnnotationsChanged({
        getProjectAnnotations: async () => {
          const annotations = await originalGetProjectAnnotations();
          return {
            ...annotations,
            loaders: [
              ...(annotations.loaders ?? []),
              async () => { await new Promise(r => setTimeout(r, delayMs)); },
            ],
          };
        },
      });
    }
  }

  return () => {
    useHideSplashScreen();

    const mode = SherloModule.getMode();

    const [compatibilityChecked, setCompatibilityChecked] = useState(false);

    useEffect(() => {
      if (mode !== 'testing') return;
      checkSdkCompatibility().then(() => setCompatibilityChecked(true));
    }, [mode]);

    if (mode === 'testing') {
      if (!compatibilityChecked) return null as unknown as ReactElement;

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
