import { ReactElement } from 'react';
import SherloModule from '../SherloModule';
import { StorybookParams, StorybookView } from '../types';
import { TestingMode } from './components';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function getStorybook(view: StorybookView, params?: StorybookParams): () => ReactElement {
  const mode = SherloModule.getMode();

  if (mode === 'testing') {
    let delayMs: number | undefined;
    try {
      delayMs = SherloModule.getConfig().initialStoryRenderDelayMs;
    } catch {
      // Config may not be available when this module is first evaluated
      // (e.g. when loaded eagerly by the withSherlo metro wrapper).
      // In that case initialStoryRenderDelayMs is not applied.
    }
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
