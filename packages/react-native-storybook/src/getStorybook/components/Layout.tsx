import React from 'react';
import { View, StyleSheet, ViewProps, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LayoutProps extends ViewProps {
  shouldAddSafeArea: boolean;
}

const Layout: React.FC<LayoutProps> = ({ shouldAddSafeArea, children, ...props }) => {
  const insets = useSafeAreaInsets();

  const showSafeArea = shouldAddSafeArea && Platform.OS === 'ios';

  return (
    <View
      testID="sherlo-getStorybook-verification"
      style={[
        StyleSheet.absoluteFillObject,
        showSafeArea && { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      {...props}
    >
      {children}
    </View>
  );
};

export default Layout;
