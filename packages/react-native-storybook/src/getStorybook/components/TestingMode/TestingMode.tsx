import { darkTheme, theme } from '@storybook/react-native-theming';
import { useState, ReactElement } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StorybookParams, StorybookView } from '../../../types';
import Storybook from './Storybook';
import setupErrorSilencing from './setupErrorSilencing';
import useTestAllStories from './useTestAllStories';

setupErrorSilencing();

function TestingMode({
  view,
  params,
}: {
  view: StorybookView;
  params?: StorybookParams;
}): ReactElement {
  const defaultTheme = useColorScheme() === 'dark' ? darkTheme : theme;

  const [uiSettings, setUiSettings] = useState({
    theme: defaultTheme,
    shouldAddSafeArea: true,
  });

  useTestAllStories({
    defaultTheme,
    setUiSettings: () => {},
    view,
  });

  return (
    <SafeAreaProvider>
      <Storybook params={params} uiSettings={uiSettings} view={view} />
    </SafeAreaProvider>
  );
}

export default TestingMode;
