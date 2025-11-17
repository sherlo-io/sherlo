import React from 'react';
import { View, StyleSheet } from 'react-native';
import TestIcon from './test-icon.svg';

export const SvgTest: React.FC = () => {
  return (
    <View style={styles.container}>
      <TestIcon width={64} height={64} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

