import React from 'react';
import { View, StyleSheet, ViewProps, Platform, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LayoutProps extends ViewProps {
  shouldAddSafeArea: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ shouldAddSafeArea, children, ...props }) => {
  const insets = useSafeAreaInsets();
  const theme = useColorScheme();

  const showSafeArea = shouldAddSafeArea && Platform.OS === 'ios';

  return (
    <View
      testID="sherlo-getStorybook-verification"
      style={[
        StyleSheet.absoluteFillObject,
        showSafeArea && { paddingTop: insets.top, paddingBottom: insets.bottom },
        { backgroundColor: theme === 'dark' ? 'black' : 'white' },
      ]}
      {...props}
    >
      {children}
    </View>
  );
};
