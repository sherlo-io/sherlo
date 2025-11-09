import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { formatCurrency, formatDate, calculateTotal, APP_NAME, VERSION } from '../utils/localUtils';

const LocalImportTest = () => {
  // Test named exports from local import
  const currency = formatCurrency(99.99, 'EUR');
  const date = formatDate(new Date('2024-01-15'));
  const total = calculateTotal([10, 20, 30]);
  
  console.log('[LocalImportTest] formatCurrency(99.99, "EUR"):', currency);
  console.log('[LocalImportTest] formatDate(new Date("2024-01-15")):', date);
  console.log('[LocalImportTest] calculateTotal([10, 20, 30]):', total);
  console.log('[LocalImportTest] APP_NAME:', APP_NAME);
  console.log('[LocalImportTest] VERSION:', VERSION);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Local Import Test</Text>
      <Text style={styles.text}>Currency: {currency}</Text>
      <Text style={styles.text}>Date: {date}</Text>
      <Text style={styles.text}>Total: {total}</Text>
      <Text style={styles.text}>App: {APP_NAME}</Text>
      <Text style={styles.text}>Version: {VERSION}</Text>
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

export default LocalImportTest;

