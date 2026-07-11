import { darkTheme, theme } from '@storybook/react-native-theming';
import { ReactElement, useRef } from 'react';
import { useColorScheme } from 'react-native';
import { StorybookParams, StorybookView } from '../../../types';
import Storybook from './Storybook';
import setupErrorSilencing from './setupErrorSilencing';
import useTestAllStories from './useTestAllStories';
import SherloModule from '../../../SherloModule';
import deepmerge from 'deepmerge';
import { MetadataProvider, MetadataProviderRef } from './MetadataProvider';
import { activateMocksForStory } from '../../storyMockActivation';

setupErrorSilencing();

let lastState = SherloModule.getLastState();

function TestingMode({
  view,
  params,
}: {
  view: StorybookView;
  params?: StorybookParams;
}): ReactElement {
  const defaultTheme = useColorScheme() === 'dark' ? darkTheme : theme;
  const metadataProviderRef = useRef<MetadataProviderRef>(null);

  const nextSnapshot = lastState?.nextSnapshot;

  // Install this story's mock set before Storybook (rendered below) mounts it - a plain
  // render-body call, not an effect, so it runs before any child component's effects
  // (React flushes child effects before the parent's). Guarded to run once per boot;
  // each story capture is a fresh app boot, so there is at most one story to activate.
  // activateMocksForStory applies meta/story mocks now and folds in global mocks once
  // the preview is ready (see storyMockActivation).
  const mocksActivatedRef = useRef(false);
  if (!mocksActivatedRef.current && nextSnapshot) {
    mocksActivatedRef.current = true;
    activateMocksForStory(view, nextSnapshot.storyId);
  }

  useTestAllStories({
    view,
    metadataProviderRef,
  });
  const uiSettings = nextSnapshot
    ? {
        theme: deepmerge(defaultTheme, nextSnapshot.parameters?.theme ?? {}),
        shouldAddSafeArea: !nextSnapshot.parameters?.noSafeArea,
      }
    : {
        theme: defaultTheme,
        shouldAddSafeArea: true,
      };

  return (
    <MetadataProvider ref={metadataProviderRef}>
      <Storybook params={params} uiSettings={uiSettings} view={view} />
    </MetadataProvider>
  );
}

export default TestingMode;

export function __resetForTests(): void {
  lastState = undefined;
}
