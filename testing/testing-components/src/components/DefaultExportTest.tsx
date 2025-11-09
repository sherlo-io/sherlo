import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import TestHelper from '../utils/testHelper';

const DefaultExportTest = () => {
  // Test default export - TestHelper has a default export
  const defaultExport = TestHelper;
  console.log('[DefaultExportTest] Default export value:', defaultExport);
  console.log('[DefaultExportTest] Default export type:', typeof defaultExport);
  console.log('[DefaultExportTest] Default export is object:', typeof defaultExport === 'object' && defaultExport !== null);
  
  if (defaultExport && typeof defaultExport === 'object') {
    console.log('[DefaultExportTest] Default export keys:', Object.keys(defaultExport));
  }

  // Access properties from default export
  const value = defaultExport?.getValue ? defaultExport.getValue() : 'unknown';
  const number = defaultExport?.getNumber ? defaultExport.getNumber() : 0;
  const obj = defaultExport?.getObject ? defaultExport.getObject() : null;
  
  console.log('[DefaultExportTest] getValue() result:', value);
  console.log('[DefaultExportTest] getNumber() result:', number);
  console.log('[DefaultExportTest] getObject() result:', obj);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Default Export Test</Text>
      <Text style={styles.text}>Value: {value}</Text>
      <Text style={styles.text}>Number: {number}</Text>
      <Text style={styles.text}>Object key: {obj?.key || 'N/A'}</Text>
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

export default DefaultExportTest;

