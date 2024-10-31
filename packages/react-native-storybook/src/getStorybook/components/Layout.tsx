import React from 'react';
import { View, StyleSheet, ViewProps, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LayoutProps extends ViewProps {
  shouldAddSafeArea: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ shouldAddSafeArea, children, style, ...props }) => {
  const insets = useSafeAreaInsets();

  const showSafeArea = shouldAddSafeArea && Platform.OS === 'ios';

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        showSafeArea && { paddingTop: insets.top, paddingBottom: insets.bottom },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};
