import React, { useEffect } from 'react';
import { SafeAreaView, StyleSheet, useColorScheme } from 'react-native';
import { setStatusBarStyle } from 'expo-status-bar';

const StoryDecorator =
  ({ placement }: { placement?: 'top' | 'center' | 'bottom' } = {}) =>
  (Story: React.FC) => {
    const theme = useColorScheme();

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
      <SafeAreaView
        style={[
          containerStyle,
          { flex: 1, backgroundColor: theme === 'dark' ? '#333' : '#dfdfdf' },
        ]}
      >
        <Story />
      </SafeAreaView>
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
