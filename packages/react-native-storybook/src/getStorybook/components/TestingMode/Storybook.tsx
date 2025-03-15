import { Theme, ThemeProvider, useTheme } from '@storybook/react-native-theming';
import { ReactElement, useMemo } from 'react';
import { View, StyleSheet, ViewProps, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { VERIFICATION_TEST_ID } from '../../../constants';
import { RunnerBridge } from '../../../helpers';
import { StorybookParams, StorybookView } from '../../../types';
import { getStorybookComponent } from '../../helpers';

function Storybook({
  params,
  uiSettings,
  view,
}: {
  uiSettings: {
    appliedTheme: Theme;
    shouldAddSafeArea: boolean;
  };
  view: StorybookView;
  params?: StorybookParams;
}): ReactElement {
  const memoizedStorybook = useMemo(() => {
    RunnerBridge.log('memoizing storybook');

    const StorybookComponent = getStorybookComponent({
      view,
      params,
      isTestingMode: true,
    });

    return <StorybookComponent />;
  }, []);

  // ThemeProvider setup reflects original setup from the storybook package
  // We need to replicate it to assure it's working in the same way as in onDeviceUI mode
  // https://github.com/storybookjs/react-native/blob/next/packages/react-native/src/View.tsx
  return (
    <ThemeProvider theme={uiSettings.appliedTheme}>
      <SafeAreaProvider>
        <Layout shouldAddSafeArea={uiSettings.shouldAddSafeArea}>{memoizedStorybook}</Layout>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

export default Storybook;

/* ========================================================================== */

function Layout({
  shouldAddSafeArea,
  children,
  ...props
}: {
  shouldAddSafeArea: boolean;
} & ViewProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const showSafeArea = shouldAddSafeArea && Platform.OS === 'ios';

  return (
    <View
      testID={VERIFICATION_TEST_ID}
      style={[
        StyleSheet.absoluteFillObject,
        // We are replicating the original setup from the storybook package
        // to assure it's working in the same way as in onDeviceUI mode
        // https://github.com/storybookjs/react-native/blob/next/packages/react-native-ui/src/Layout.tsx
        showSafeArea && {
          flex: 1,
          paddingTop: showSafeArea ? insets.top : 0,
          backgroundColor: theme.background.content,
        },
      ]}
      {...props}
    >
      {children}
    </View>
  );
}
