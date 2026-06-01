import React, { ReactElement, useEffect, useRef } from 'react';
import SherloModule from '../SherloModule';
import checkSdkCompatibility, { __resetCacheForTests as checkSdkCompatibilityReset } from '../checkSdkCompatibility';
import type { InitialSelection } from '@storybook/react-native';
import { StorybookParams, StorybookView } from '../types';
import { TestingMode } from './components';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SherloStoryErrorBoundary from './components/SherloStoryErrorBoundary';
import { LOG_FILE, PROTOCOL_FILE } from '../constants';

let isSdkCompatible = true;
if (SherloModule.getMode() === 'testing') {
  isSdkCompatible = checkSdkCompatibility();
}

function getStorybook(view: StorybookView, params?: StorybookParams): () => ReactElement {
  const mode = SherloModule.getMode();

  // Cancel the native NOT_DISPLAYED watchdog: SDK is being activated.
  // Safe in all modes: the dummy SherloModule is a no-op; the real native
  // implementation is idempotent (safe to call even after the timer fired).
  SherloModule.notifyGetStorybookCalled();

  // Only set up testing-mode story decorators when SDK is compatible.
  // When isSdkCompatible=false the component returns null anyway, and calling
  // getConfig() here can throw if config.sherlo isn't on disk yet (EAS-update
  // timing edge case), which would crash the app before the async iOS
  // sendNativeError(ERROR_SDK_COMPATIBILITY) write completes.
  if (mode === 'testing' && isSdkCompatible) {
    const delayMs = SherloModule.getConfig().initialStoryRenderDelayMs;
    const originalGetProjectAnnotations = view._preview.getProjectAnnotations.bind(
      view._preview
    );
    view._preview.onGetProjectAnnotationsChanged({
      getProjectAnnotations: async () => {
        const annotations = await originalGetProjectAnnotations();
        return {
          ...annotations,
          decorators: [
            (Story: any, context: any) => (
              <SherloStoryErrorBoundary storyId={context.id}>
                <Story />
              </SherloStoryErrorBoundary>
            ),
            ...(annotations.decorators ?? []),
          ],
          ...(delayMs !== undefined && {
            loaders: [
              ...(annotations.loaders ?? []),
              async () => { await new Promise(r => setTimeout(r, delayMs)); },
            ],
          }),
        };
      },
    });
  }

  if (mode === 'storybook') {
    try {
      const config = SherloModule.getConfig();
      const initialStoryId = config.inspect?.initialStoryId;
      // Force shouldPersistSelection:false so inspect.initialStoryId always wins
      // over persisted AsyncStorage state from a previous launch.
      params = {
        ...(params ?? {}),
        shouldPersistSelection: false,
        ...(initialStoryId && { initialSelection: initialStoryId as InitialSelection }),
      };
    } catch (_e) {}
  }

  const isTestingMode = mode === 'testing';
  const isStorybookMode = mode === 'storybook';

  return function SherloStorybookEntry() {
    useHideSplashScreen();

    const storybookLoadedReported = useRef(false);
    const inspectLogReported = useRef(false);

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
          SherloModule.appendFile(PROTOCOL_FILE, `${content}\n`);
        }
      } catch (_e) {}
    }, []);

    // Emit INSPECT_STORY_OPENED to log.sherlo so the runner can deterministically
    // observe that the configured inspect.initialStoryId was applied.
    useEffect(() => {
      if (!isStorybookMode) return;
      if (inspectLogReported.current) return;
      try {
        const cfg = SherloModule.getConfig();
        const storyId = cfg.inspect?.initialStoryId;
        if (!storyId) return;
        inspectLogReported.current = true;
        SherloModule.appendFile(LOG_FILE, `INSPECT_STORY_OPENED:${storyId}\n`);
      } catch (_e) {}
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

export function __resetForTests(): void {
  isSdkCompatible = true;
  checkSdkCompatibilityReset();
}
