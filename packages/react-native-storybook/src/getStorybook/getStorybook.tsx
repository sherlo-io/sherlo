import React, { ReactElement, useEffect, useRef } from 'react';
import SherloModule from '../SherloModule';
import checkSdkCompatibility, { ERROR_STORYBOOK_NOT_DISPLAYED } from '../checkSdkCompatibility';
import { StorybookParams, StorybookView } from '../types';
import { TestingMode } from './components';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { storybookRendered } from './components/TestingMode/Storybook';

let isSdkCompatible = true;
if (SherloModule.getMode() === 'testing') {
  isSdkCompatible = checkSdkCompatibility();
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
            loaders: [
              ...(annotations.loaders ?? []),
              async () => { await new Promise(r => setTimeout(r, delayMs)); },
            ],
          };
        },
      });
    }
  }

  const isTestingMode = mode === 'testing';

  return () => {
    useHideSplashScreen();

    const storybookLoadedReported = useRef(false);

    // Emit STORYBOOK_LOADED after the first render commits so the runner only
    // sees the signal once the React tree is actually mounted.  Emitting it
    // synchronously inside patchedStart() (before any render) caused the runner
    // to mis-classify a mid-render crash as storybookNotDisplayed instead of
    // appFailedToStart.
    useEffect(() => {
      if (!isTestingMode) return;
      if (storybookLoadedReported.current) return;
      storybookLoadedReported.current = true;
      try {
        if (SherloModule.getMode() === 'testing') {
          const content = JSON.stringify({ action: 'STORYBOOK_LOADED', timestamp: Date.now(), entity: 'app' });
          SherloModule.appendFile('protocol.sherlo', `${content}\n`);
        }
      } catch (_e) {}
    }, []);

    useEffect(() => {
      if (!isTestingMode) return;
      const timer = setTimeout(() => {
        if (!storybookRendered) {
          SherloModule.sendNativeError(
            ERROR_STORYBOOK_NOT_DISPLAYED,
            'Storybook did not appear within 10s of withSherlo mount'
          );
        }
      }, 10_000);
      return () => clearTimeout(timer);
    }, []);

    if (isTestingMode) {
      if (!isSdkCompatible) return null as unknown as ReactElement;

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
