import React from 'react';
import { SafeAreaView, StyleSheet, useColorScheme, StatusBar } from 'react-native';

const StoryDecorator =
  ({ placement }: { placement?: 'top' | 'center' | 'bottom' } = {}) =>
  (Story: React.FC) => {
    const theme = useColorScheme();

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
        <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
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
