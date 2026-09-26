import { darkTheme, theme } from '@storybook/react-native-theming';
import { ReactElement, useRef, useState } from 'react';
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

  // Install this story's mock set before Storybook (rendered below) mounts it - from the
  // state initializer, not an effect, so it runs before any child component's effects (React
  // flushes child effects before the parent's) and exactly once per boot; each story capture
  // is a fresh app boot, so there is at most one story to activate. activateMocksForStory
  // applies meta/story mocks now and folds in global mocks once the preview is ready (see
  // storyMockActivation).
  //
  // A mock declared by an import expression cannot install until that import resolves, so
  // activateMocksForStory hands back a promise whenever one is outstanding. Storybook is held
  // back until it settles: a story that rendered first would read the REAL module, and this
  // capture renders it once and never again - it would record the real value.
  const [isWaitingForMocks, setIsWaitingForMocks] = useState(() => {
    if (!nextSnapshot) return false;

    const installingMocks = activateMocksForStory(view, nextSnapshot.storyId);
    if (!installingMocks) return false;

    installingMocks.then(() => setIsWaitingForMocks(false));
    return true;
  });

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
      {isWaitingForMocks ? null : <Storybook params={params} uiSettings={uiSettings} view={view} />}
    </MetadataProvider>
  );
}

export default TestingMode;

export function __resetForTests(): void {
  lastState = undefined;
}
