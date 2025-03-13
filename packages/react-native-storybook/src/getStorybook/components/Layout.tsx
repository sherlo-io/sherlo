import React from 'react';
import { View, StyleSheet, ViewProps, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@storybook/react-native-theming';
import { VERIFICATION_TEST_ID } from '../../constants';

interface LayoutProps extends ViewProps {
  shouldAddSafeArea: boolean;
}

const Layout: React.FC<LayoutProps> = ({ shouldAddSafeArea, children, ...props }) => {
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
};

export default Layout;
