import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LayoutProps extends ViewProps {
  shouldAddSafeArea: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ shouldAddSafeArea, children, style, ...props }) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        shouldAddSafeArea && { paddingTop: insets.top, paddingBottom: insets.bottom },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};
