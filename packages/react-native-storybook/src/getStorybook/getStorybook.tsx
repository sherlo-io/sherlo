import { ReactElement, useState, useEffect, createElement } from 'react';
import SherloModule from '../SherloModule';
import { StorybookParams, StorybookView } from '../types';
import { TestingMode } from './components';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { StoryFn } from '@storybook/react';

// Captured at module load time so the 1s grace is measured from app boot,
// not from when the decorator first runs.
const APP_START_TIME = Date.now();

const FONT_GRACE_PERIOD_MS = 1000;

// Outermost decorator (added last) that delays story rendering until fonts
// are registered. On Android, TextMeasureCache caches Roboto fallback metrics
// if story text renders before custom fonts are registered — this prevents that.
function SherloFontGraceDecorator(Story: StoryFn) {
  const elapsed = Date.now() - APP_START_TIME;
  const [ready, setReady] = useState(elapsed >= FONT_GRACE_PERIOD_MS);

  useEffect(() => {
    if (!ready) {
      const remaining = FONT_GRACE_PERIOD_MS - (Date.now() - APP_START_TIME);
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
    const originalGetProjectAnnotations = view._preview.getProjectAnnotations.bind(
      view._preview
    );
    view._preview.onGetProjectAnnotationsChanged({
      getProjectAnnotations: async () => {
        const annotations = await originalGetProjectAnnotations();
        return {
          ...annotations,
          decorators: [...(annotations.decorators ?? []), SherloFontGraceDecorator],
        };
      },
    });
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
