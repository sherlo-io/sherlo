import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const PlatformSpecificComponent = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>This component will be compared to the Figma design</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 18,
    marginBottom: 20,
  },
});

export default PlatformSpecificComponent;
