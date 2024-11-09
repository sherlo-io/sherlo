import React, { useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { setStatusBarStyle } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
const StoryDecorator =
  ({ placement }: { placement?: 'top' | 'center' | 'bottom' } = {}) =>
  (Story: React.FC) => {
    const theme = useColorScheme();
    const insets = useSafeAreaInsets();

    useEffect(() => {
      setStatusBarStyle(theme === 'dark' ? 'light' : 'dark');
    }, [theme]);

    let containerStyle = {};

    switch (placement) {
      case 'top':
        containerStyle = styles.top;
        break;
      case 'center':
        containerStyle = styles.center;
        break;
      case 'bottom':
        containerStyle = styles.bottom;
        break;
      default:
        break;
    }

    return (
      <View
        style={[
          containerStyle,
          {
            flex: 1,
            backgroundColor: theme === 'dark' ? '#333' : '#dfdfdf',
            paddingBottom: insets.bottom,
            paddingTop: insets.top,
          },
        ]}
      >
        <Story />
      </View>
    );
  };

const styles = StyleSheet.create({
  top: {
    justifyContent: 'flex-start',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottom: {
    justifyContent: 'flex-end',
  },
});

export default StoryDecorator;
