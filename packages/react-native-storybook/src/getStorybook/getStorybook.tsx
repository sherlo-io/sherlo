import { ReactElement, useState, useEffect, createElement } from 'react';
import SherloModule from '../SherloModule';
import { StorybookParams, StorybookView } from '../types';
import { TestingMode } from './components';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { StoryFn } from '@storybook/react';

// Captured at module load time so the delay is measured from app boot,
// not from when the decorator first runs.
const APP_START_TIME = Date.now();

// Outermost decorator that delays story rendering in testing mode.
// Prevents race conditions where stories render before async setup
// (e.g. custom font registration) completes.
function SherloInitialRenderDelayDecorator(Story: StoryFn, delayMs: number) {
  const elapsed = Date.now() - APP_START_TIME;
  const [ready, setReady] = useState(elapsed >= delayMs);

  useEffect(() => {
    if (!ready) {
      const remaining = delayMs - (Date.now() - APP_START_TIME);
      const timer = setTimeout(() => setReady(true), Math.max(0, remaining));
      return () => clearTimeout(timer);
    }
  }, []);

  if (!ready) return null;
  return createElement(Story, {});
}

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
            decorators: [
              ...(annotations.decorators ?? []),
              (Story: StoryFn) => SherloInitialRenderDelayDecorator(Story, delayMs),
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
