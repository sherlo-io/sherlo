import React from 'react';
import { View, StyleSheet, ViewProps, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VERIFICATION_TEST_ID } from '../../constants';

interface LayoutProps extends ViewProps {
  shouldAddSafeArea: boolean;
}

const Layout: React.FC<LayoutProps> = ({ shouldAddSafeArea, children, ...props }) => {
  const insets = useSafeAreaInsets();

  const showSafeArea = shouldAddSafeArea && Platform.OS === 'ios';

  return (
    <View
      testID={VERIFICATION_TEST_ID}
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
