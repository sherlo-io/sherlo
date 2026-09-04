import React, { ReactElement, useEffect } from 'react';
import SherloModule from '../SherloModule';
import type { InitialSelection } from '@storybook/react-native';
import { StorybookParams, StorybookView } from '../types';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SherloStoryErrorBoundary from './components/SherloStoryErrorBoundary';
import { getStorybookChannel } from './storybookChannel';
import {
  startInteractiveMockActivation,
  stopInteractiveMockActivation,
} from './interactiveMockActivation';

interface SherloHost {
  storybook: { view: StorybookView; params: StorybookParams | undefined } | null;
  takenOverBy: React.ComponentType | null;
}

function getHost(): SherloHost | undefined {
  return (globalThis as unknown as { __SHERLO_HOST__?: SherloHost }).__SHERLO_HOST__;
}

/**
 * THE PUBLIC HALF ONLY. Everything downstream of this - story enumeration,
 * the capture loop, readiness, mock activation IN TESTING MODE, metadata
 * collection, the runner protocol - is private, reused through the seam by
 * whatever attaches. This file has exactly one job in testing mode: capture
 * view/params on the seam (`host.storybook`), install the position-bound
 * decorator (the only place a story's throw is observable - see
 * SherloStoryErrorBoundary), and hand rendering off to `host.takenOverBy`
 * inside a SafeAreaProvider shell that wraps whatever the private runtime
 * renders. No private capture-mode component, no protocol writes, no compatibility gate - a
 * customer on an older or newer native binary than whatever attaches simply
 * negotiates per capability now, never a blanket refusal.
 */
function getStorybook(view: StorybookView, params?: StorybookParams): () => ReactElement {
  const mode = SherloModule.getMode();
  const host = getHost();

  // The one handle the build-time half captures, for a late-attached runtime
  // to read - unconditionally, since the runtime decides whether it cares.
  if (host) {
    host.storybook = { view, params };
  }

  // Cancel the native NOT_DISPLAYED watchdog: SDK is being activated.
  // Safe in all modes: the dummy SherloModule is a no-op; the real native
  // implementation is idempotent (safe to call even after the timer fired).
  SherloModule.notifyGetStorybookCalled();

  if (mode === 'testing') {
    const testingConfig = SherloModule.getConfig();
    const delayMs = testingConfig.initialStoryRenderDelayMs;

    // Guarded PER PREVIEW, not per getStorybookUI() call: view.getStorybookUI is
    // called from getStorybook() every time the wrapper's patchedStart() runs it,
    // which can happen more than once for the same preview. Without this guard
    // each call installs another decorator, so a story ends up wrapped in one
    // boundary per call - harmless today because the boundary is a pass-through
    // and boundaries nest cleanly, but not harmless in general: this hook is
    // where every future decorator goes, and one that counts or measures
    // anything would silently run N times.
    const preview = view._preview as unknown as { __sherloDecoratorInstalled?: boolean };
    if (!preview.__sherloDecoratorInstalled) {
      preview.__sherloDecoratorInstalled = true;

      const originalGetProjectAnnotations = view._preview.getProjectAnnotations.bind(view._preview);
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
                async () => {
                  await new Promise((r) => setTimeout(r, delayMs));
                },
              ],
            }),
          };
        },
      });
    }
  }

  if (mode === 'storybook') {
    let initialStoryId: string | undefined;
    try {
      const config = SherloModule.getConfig();
      initialStoryId = config.inspect?.initialStoryId;
      // Force shouldPersistSelection:false so inspect.initialStoryId always wins
      // over persisted AsyncStorage state from a previous launch.
      params = {
        ...(params ?? {}),
        shouldPersistSelection: false,
        ...(initialStoryId && { initialSelection: initialStoryId as InitialSelection }),
      };
    } catch (_e) {}

    // Attach the story-change listener here - the earliest JS access to the channel in
    // this mode, before the component tree below ever renders - so the very first
    // selection Storybook resolves on mount is not missed. Pass initialStoryId so the
    // story Storybook lands on has its mocks activated immediately: storyChanged does
    // not fire for that first selection, so without this a direct launch onto a mocked
    // story would serve real values.
    try {
      startInteractiveMockActivation(view, getStorybookChannel(view), initialStoryId);
    } catch (_e) {}
  }

  const isCapturing = mode === 'testing';
  const isStorybookMode = mode === 'storybook';

  return function SherloStorybookEntry() {
    useHideSplashScreen();

    // Leaving Storybook (unmount) tears down the mock activation started above:
    // stop tracking selection changes and pass every module through to real again.
    useEffect(() => {
      if (!isStorybookMode) return;
      return () => {
        stopInteractiveMockActivation();
      };
    }, []);

    if (isCapturing) {
      const TakenOver = getHost()?.takenOverBy;
      return <SafeAreaProvider>{TakenOver ? <TakenOver /> : null}</SafeAreaProvider>;
    }

    const Storybook = getStorybookComponent({ view, params });

    return <Storybook />;
  };
}

export default getStorybook;
