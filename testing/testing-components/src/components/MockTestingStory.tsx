import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { getLocales } from 'expo-localization';
import TestHelper from '../utils/testHelper';
import { formatCurrency, formatDate, calculateTotal, APP_NAME, VERSION } from '../utils/localUtils';

interface TestResult {
  name: string;
  passed: boolean;
  expected: any;
  actual: any;
}

interface MockTestingStoryProps {
  expected?: {
    localImport?: {
      formatCurrency?: string;
      formatDate?: string;
      calculateTotal?: number;
      APP_NAME?: string;
      VERSION?: string;
    };
    defaultExport?: {
      getValue?: string;
      getNumber?: number;
      getObject?: { key: string };
    };
    multipleNamedExports?: {
      getLocales?: Array<{ languageCode: string; regionCode: string }>;
    };
  };
}

const MockTestingStory: React.FC<MockTestingStoryProps> = ({ expected = {} }) => {
  const results: TestResult[] = [];

  // Test 1: Local Import
  if (expected.localImport) {
    const actualCurrency = formatCurrency(99.99, 'EUR');
    const actualDate = formatDate(new Date('2024-01-15'));
    const actualTotal = calculateTotal([10, 20, 30]);
    const actualAppName = APP_NAME;
    const actualVersion = VERSION;

    if (expected.localImport.formatCurrency !== undefined) {
      results.push({
        name: 'Local Import: formatCurrency',
        passed: actualCurrency === expected.localImport.formatCurrency,
        expected: expected.localImport.formatCurrency,
        actual: actualCurrency,
      });
    }
    if (expected.localImport.formatDate !== undefined) {
      results.push({
        name: 'Local Import: formatDate',
        passed: actualDate === expected.localImport.formatDate,
        expected: expected.localImport.formatDate,
        actual: actualDate,
      });
    }
    if (expected.localImport.calculateTotal !== undefined) {
      results.push({
        name: 'Local Import: calculateTotal',
        passed: actualTotal === expected.localImport.calculateTotal,
        expected: expected.localImport.calculateTotal,
        actual: actualTotal,
      });
    }
    if (expected.localImport.APP_NAME !== undefined) {
      results.push({
        name: 'Local Import: APP_NAME',
        passed: actualAppName === expected.localImport.APP_NAME,
        expected: expected.localImport.APP_NAME,
        actual: actualAppName,
      });
    }
    if (expected.localImport.VERSION !== undefined) {
      results.push({
        name: 'Local Import: VERSION',
        passed: actualVersion === expected.localImport.VERSION,
        expected: expected.localImport.VERSION,
        actual: actualVersion,
      });
    }
  }

  // Test 2: Default Export
  if (expected.defaultExport) {
    const actualValue = TestHelper.getValue();
    const actualNumber = TestHelper.getNumber();
    const actualObject = TestHelper.getObject();

    if (expected.defaultExport.getValue !== undefined) {
      results.push({
        name: 'Default Export: getValue',
        passed: actualValue === expected.defaultExport.getValue,
        expected: expected.defaultExport.getValue,
        actual: actualValue,
      });
    }
    if (expected.defaultExport.getNumber !== undefined) {
      results.push({
        name: 'Default Export: getNumber',
        passed: actualNumber === expected.defaultExport.getNumber,
        expected: expected.defaultExport.getNumber,
        actual: actualNumber,
      });
    }
    if (expected.defaultExport.getObject !== undefined) {
      results.push({
        name: 'Default Export: getObject',
        passed: JSON.stringify(actualObject) === JSON.stringify(expected.defaultExport.getObject),
        expected: expected.defaultExport.getObject,
        actual: actualObject,
      });
    }
  }

  // Test 3: Multiple Named Exports
  if (expected.multipleNamedExports) {
    const actualLocales = getLocales();
    if (expected.multipleNamedExports.getLocales !== undefined) {
      results.push({
        name: 'Multiple Named Exports: getLocales',
        passed: JSON.stringify(actualLocales) === JSON.stringify(expected.multipleNamedExports.getLocales),
        expected: expected.multipleNamedExports.getLocales,
        actual: actualLocales,
      });
    }
  }

  const allPassed = results.length > 0 && results.every(r => r.passed);
  const passedCount = results.filter(r => r.passed).length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mock Testing Story</Text>
      <Text style={styles.summary}>
        {passedCount}/{results.length} tests passed {allPassed ? '✓' : '✗'}
      </Text>
      
      {results.map((result, index) => (
        <View key={index} style={styles.testRow}>
          <Text style={styles.testName}>{result.name}</Text>
          <Text style={[styles.status, result.passed ? styles.passed : styles.failed]}>
            {result.passed ? '✓' : '✗'}
          </Text>
        </View>
      ))}

      {results.length === 0 && (
        <Text style={styles.noTests}>No tests configured. Using real implementations.</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  summary: {
    fontSize: 18,
    marginBottom: 20,
    fontWeight: '600',
  },
  testRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  testName: {
    fontSize: 16,
    flex: 1,
  },
  status: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  passed: {
    color: '#4CAF50',
  },
  failed: {
    color: '#F44336',
  },
  noTests: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default MockTestingStory;

