import { darkTheme, theme } from '@storybook/react-native-theming';
import { ReactElement, useRef } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StorybookParams, StorybookView } from '../../../types';
import Storybook from './Storybook';
import setupErrorSilencing from './setupErrorSilencing';
import useTestAllStories from './useTestAllStories';
import SherloModule from '../../../helpers/SherloModule';
import deepmerge from 'deepmerge';
import { ViewInspector, ViewInspectorRef } from './ViewInspector';

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
  const viewInspectorRef = useRef<ViewInspectorRef>(null);

  useTestAllStories({
    view,
    viewInspectorRef: {
      getJSInspectorData: () => viewInspectorRef.current?.getJSInspectorData() || null,
    },
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
    <ViewInspector ref={viewInspectorRef}>
      <SafeAreaProvider>
        <Storybook params={params} uiSettings={uiSettings} view={view} />
      </SafeAreaProvider>
    </ViewInspector>
  );
}

export default TestingMode;
