import React from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';

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
      <View
        style={[
          containerStyle,
          {
            flex: 1,
            backgroundColor: theme === 'dark' ? '#333' : '#dfdfdf',
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
