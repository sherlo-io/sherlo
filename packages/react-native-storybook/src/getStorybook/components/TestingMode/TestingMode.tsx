import { darkTheme, theme } from '@storybook/react-native-theming';
import { useState, ReactElement } from 'react';
import { useColorScheme } from 'react-native';
import { StorybookParams, StorybookView } from '../../../types';
import useTestAllStories from './useTestAllStories';
import setupErrorSilencing from './setupErrorSilencing';
import Storybook from './Storybook';

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
    setUiSettings,
    view,
  });

  return <Storybook params={params} uiSettings={uiSettings} view={view} />;
}

export default TestingMode;
