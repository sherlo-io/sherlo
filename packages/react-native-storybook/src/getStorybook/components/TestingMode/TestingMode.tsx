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

  // The story's mocks are installed by Sherlo's loader (../../sherloAnnotation), which Storybook
  // awaits before it renders the story, so nothing here holds Storybook back.
  useTestAllStories({
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
