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
      formatDate?: string | null; // null means check for valid date string (real implementation)
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
      getLocales?: Array<{ languageCode: string; regionCode: string }> | null; // null means check for real implementation
    };
  };
}

const MockTestingStory: React.FC<MockTestingStoryProps> = ({ expected = {} }) => {
  console.log(
    '[MockTestingStory] Component rendered with expected:',
    JSON.stringify(expected, null, 2)
  );
  const results: TestResult[] = [];

  // Test 1: Local Import
  if (expected.localImport) {
    console.log('[MockTestingStory] Testing Local Import...');
    console.log('[MockTestingStory] formatCurrency type:', typeof formatCurrency);
    console.log('[MockTestingStory] formatDate type:', typeof formatDate);
    console.log('[MockTestingStory] calculateTotal type:', typeof calculateTotal);
    console.log('[MockTestingStory] APP_NAME type:', typeof APP_NAME, 'value:', APP_NAME);
    console.log('[MockTestingStory] VERSION type:', typeof VERSION, 'value:', VERSION);

    const actualCurrency = formatCurrency(99.99, 'EUR');
    const actualDate = formatDate(new Date('2024-01-15'));
    const actualTotal = calculateTotal([10, 20, 30]);
    const actualAppName = APP_NAME;
    const actualVersion = VERSION;

    console.log('[MockTestingStory] Local Import actual values:', {
      formatCurrency: actualCurrency,
      formatDate: actualDate,
      calculateTotal: actualTotal,
      APP_NAME: actualAppName,
      VERSION: actualVersion,
    });

    if (expected.localImport.formatCurrency !== undefined) {
      const passed = actualCurrency === expected.localImport.formatCurrency;
      console.log('[MockTestingStory] Local Import: formatCurrency comparison:', {
        expected: expected.localImport.formatCurrency,
        actual: actualCurrency,
        passed,
      });
      results.push({
        name: 'Local Import: formatCurrency',
        passed,
        expected: expected.localImport.formatCurrency,
        actual: actualCurrency,
      });
    }
    if (expected.localImport.formatDate !== undefined) {
      // For date comparison, check if it's a valid date string (not exact match for real implementation)
      const isDateString = typeof actualDate === 'string' && actualDate.length > 0;
      const passed =
        expected.localImport.formatDate === null
          ? isDateString // If null, just check it's a valid date string
          : actualDate === expected.localImport.formatDate; // Otherwise exact match
      console.log('[MockTestingStory] Local Import: formatDate comparison:', {
        expected:
          expected.localImport.formatDate === null
            ? 'Valid date string'
            : expected.localImport.formatDate,
        actual: actualDate,
        isDateString,
        passed,
      });
      results.push({
        name: 'Local Import: formatDate',
        passed,
        expected:
          expected.localImport.formatDate === null
            ? 'Valid date string'
            : expected.localImport.formatDate,
        actual: actualDate,
      });
    }
    if (expected.localImport.calculateTotal !== undefined) {
      const passed = actualTotal === expected.localImport.calculateTotal;
      console.log('[MockTestingStory] Local Import: calculateTotal comparison:', {
        expected: expected.localImport.calculateTotal,
        actual: actualTotal,
        passed,
      });
      results.push({
        name: 'Local Import: calculateTotal',
        passed,
        expected: expected.localImport.calculateTotal,
        actual: actualTotal,
      });
    }
    if (expected.localImport.APP_NAME !== undefined) {
      const passed = actualAppName === expected.localImport.APP_NAME;
      console.log('[MockTestingStory] Local Import: APP_NAME comparison:', {
        expected: expected.localImport.APP_NAME,
        actual: actualAppName,
        passed,
      });
      results.push({
        name: 'Local Import: APP_NAME',
        passed,
        expected: expected.localImport.APP_NAME,
        actual: actualAppName,
      });
    }
    if (expected.localImport.VERSION !== undefined) {
      const passed = actualVersion === expected.localImport.VERSION;
      console.log('[MockTestingStory] Local Import: VERSION comparison:', {
        expected: expected.localImport.VERSION,
        actual: actualVersion,
        passed,
      });
      results.push({
        name: 'Local Import: VERSION',
        passed,
        expected: expected.localImport.VERSION,
        actual: actualVersion,
      });
    }
  }

  // Test 2: Default Export
  if (expected.defaultExport) {
    console.log('[MockTestingStory] Testing Default Export...');
    console.log('[MockTestingStory] TestHelper type:', typeof TestHelper);
    console.log('[MockTestingStory] TestHelper value:', TestHelper);
    console.log('[MockTestingStory] TestHelper is null:', TestHelper === null);
    console.log('[MockTestingStory] TestHelper is undefined:', TestHelper === undefined);

    if (TestHelper && typeof TestHelper === 'object') {
      const testHelperAny = TestHelper as any;
      console.log('[MockTestingStory] TestHelper keys:', Object.keys(TestHelper));
      console.log('[MockTestingStory] TestHelper.getValue type:', typeof testHelperAny.getValue);
      console.log('[MockTestingStory] TestHelper.getNumber type:', typeof testHelperAny.getNumber);
      console.log('[MockTestingStory] TestHelper.getObject type:', typeof testHelperAny.getObject);
      console.log('[MockTestingStory] TestHelper.default:', testHelperAny.default);

      // Check if TestHelper has a default property (Metro ES module interop)
      if (testHelperAny.default) {
        console.log(
          '[MockTestingStory] TestHelper.default keys:',
          Object.keys(testHelperAny.default)
        );
        console.log(
          '[MockTestingStory] TestHelper.default.getValue type:',
          typeof testHelperAny.default.getValue
        );
      }
    }

    // Handle case where TestHelper might be undefined (no mocks, real module not available)
    if (!TestHelper || typeof TestHelper !== 'object') {
      console.log(
        '[MockTestingStory] Default Export: Module not available - TestHelper is not an object'
      );
      results.push({
        name: 'Default Export: Module not available',
        passed: false,
        expected: 'Module object',
        actual: TestHelper,
      });
    } else {
      // Try both TestHelper directly and TestHelper.default (for Metro ES module interop)
      const testHelperAny = TestHelper as any;
      const helper = testHelperAny.default || TestHelper;
      console.log(
        '[MockTestingStory] Using helper:',
        helper === TestHelper ? 'TestHelper' : 'TestHelper.default'
      );
      console.log('[MockTestingStory] Helper keys:', Object.keys(helper));

      const actualValue = helper.getValue?.();
      const actualNumber = helper.getNumber?.();
      const actualObject = helper.getObject?.();

      console.log('[MockTestingStory] Default Export actual values:', {
        getValue: actualValue,
        getNumber: actualNumber,
        getObject: actualObject,
      });

      if (expected.defaultExport.getValue !== undefined) {
        const passed = actualValue === expected.defaultExport.getValue;
        console.log('[MockTestingStory] Default Export: getValue comparison:', {
          expected: expected.defaultExport.getValue,
          actual: actualValue,
          passed,
        });
        results.push({
          name: 'Default Export: getValue',
          passed,
          expected: expected.defaultExport.getValue,
          actual: actualValue,
        });
      }
      if (expected.defaultExport.getNumber !== undefined) {
        const passed = actualNumber === expected.defaultExport.getNumber;
        console.log('[MockTestingStory] Default Export: getNumber comparison:', {
          expected: expected.defaultExport.getNumber,
          actual: actualNumber,
          passed,
        });
        results.push({
          name: 'Default Export: getNumber',
          passed,
          expected: expected.defaultExport.getNumber,
          actual: actualNumber,
        });
      }
      if (expected.defaultExport.getObject !== undefined) {
        const passed =
          JSON.stringify(actualObject) === JSON.stringify(expected.defaultExport.getObject);
        console.log('[MockTestingStory] Default Export: getObject comparison:', {
          expected: expected.defaultExport.getObject,
          actual: actualObject,
          passed,
        });
        results.push({
          name: 'Default Export: getObject',
          passed,
          expected: expected.defaultExport.getObject,
          actual: actualObject,
        });
      }
    }
  }

  // Test 3: Multiple Named Exports
  if (expected.multipleNamedExports) {
    console.log('[MockTestingStory] Testing Multiple Named Exports...');
    console.log('[MockTestingStory] getLocales type:', typeof getLocales);

    const actualLocales = getLocales();
    console.log('[MockTestingStory] getLocales() returned:', actualLocales);
    console.log('[MockTestingStory] getLocales() is array:', Array.isArray(actualLocales));
    console.log('[MockTestingStory] getLocales() length:', actualLocales?.length);

    if (expected.multipleNamedExports.getLocales !== undefined) {
      // Special case: if expected is null, we're checking for real implementation (just verify it's an array)
      if (expected.multipleNamedExports.getLocales === null) {
        const passed = Array.isArray(actualLocales) && actualLocales.length > 0;
        console.log('[MockTestingStory] Multiple Named Exports: getLocales (real) comparison:', {
          expected: 'Array with locale objects',
          actual: actualLocales,
          isArray: Array.isArray(actualLocales),
          hasLength: actualLocales?.length > 0,
          passed,
        });
        results.push({
          name: 'Multiple Named Exports: getLocales (real)',
          passed,
          expected: 'Array with locale objects',
          actual: actualLocales,
        });
      } else {
        const passed =
          JSON.stringify(actualLocales) ===
          JSON.stringify(expected.multipleNamedExports.getLocales);
        console.log('[MockTestingStory] Multiple Named Exports: getLocales comparison:', {
          expected: expected.multipleNamedExports.getLocales,
          actual: actualLocales,
          passed,
        });
        results.push({
          name: 'Multiple Named Exports: getLocales',
          passed,
          expected: expected.multipleNamedExports.getLocales,
          actual: actualLocales,
        });
      }
    }
  }

  const allPassed = results.length > 0 && results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;

  console.log('[MockTestingStory] Test Summary:', {
    totalTests: results.length,
    passedCount,
    allPassed,
    results: results.map((r) => ({ name: r.name, passed: r.passed })),
  });

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
