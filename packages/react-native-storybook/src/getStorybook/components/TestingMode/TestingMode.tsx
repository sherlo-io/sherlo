import { darkTheme, theme } from '@storybook/react-native-theming';
import { ReactElement, useRef } from 'react';
import { useColorScheme } from 'react-native';
import { StorybookParams, StorybookView } from '../../../types';
import Storybook from './Storybook';
import setupErrorSilencing from './setupErrorSilencing';
import useTestAllStories from './useTestAllStories';
import SherloModule from '../../../helpers/SherloModule';
import deepmerge from 'deepmerge';
import { MetadataProvider, MetadataProviderRef } from './MetadataProvider';

setupErrorSilencing();

const lastState = SherloModule.getLastState();

function TestingMode({
  view,
  params,
}: {
  view: StorybookView;
  params?: StorybookParams;
}): ReactElement {
  const defaultTheme = useColorScheme() === 'dark' ? darkTheme : theme;
  const metadataProviderRef = useRef<MetadataProviderRef>(null);

  useTestAllStories({
    view,
    metadataProviderRef,
  });

  const nextSnapshot = lastState?.nextSnapshot;
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
