import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { getLocales } from 'expo-localization';

const MultipleNamedExportsTest = () => {
  // Test multiple named exports from expo-localization
  // We'll mock getLocales and other properties to verify multiple exports work
  const localesArray = getLocales();
  
  console.log('[MultipleNamedExportsTest] getLocales():', localesArray);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Multiple Named Exports Test</Text>
      <Text style={styles.text}>First Locale: {localesArray[0]?.languageCode || 'N/A'}</Text>
      <Text style={styles.text}>Region: {localesArray[0]?.regionCode || 'N/A'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  text: {
    fontSize: 16,
    marginVertical: 8,
  },
});

export default MultipleNamedExportsTest;

