import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { getLocales } from 'expo-localization';
import TestHelper from '../utils/testHelper';
import { formatCurrency, formatDate, calculateTotal, APP_NAME, VERSION } from '../utils/localUtils';
import { fetchUserData, fetchSettings } from '../utils/asyncUtils';
import { DataProcessor, Calculator } from '../utils/classUtils';
import {
  processPayment,
  getUserPaymentInfo,
  processDataWithMultiplier,
} from '../utils/nestedUtils';

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
    asyncFunctions?: {
      fetchUserData?: { id: string; name: string };
      fetchSettings?: { theme: string; language: string };
    };
    classExports?: {
      dataProcessorProcess?: number;
      dataProcessorGetMultiplier?: number;
      calculatorAdd?: number;
      calculatorSubtract?: number;
    };
    nestedMocks?: {
      processPayment?: string;
      getUserPaymentInfo?: string;
      processDataWithMultiplier?: number;
    };
  };
}

const MockTestingStory: React.FC<MockTestingStoryProps> = ({ expected = {} }) => {
  console.log(
    '[MockTestingStory] Component rendered with expected:',
    JSON.stringify(expected, null, 2)
  );
  const [results, setResults] = useState<TestResult[]>([]);

  // Collect all synchronous test results
  useEffect(() => {
    const syncResults: TestResult[] = [];

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
        syncResults.push({
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
        syncResults.push({
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
        syncResults.push({
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
        syncResults.push({
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
        syncResults.push({
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
        console.log(
          '[MockTestingStory] TestHelper.getNumber type:',
          typeof testHelperAny.getNumber
        );
        console.log(
          '[MockTestingStory] TestHelper.getObject type:',
          typeof testHelperAny.getObject
        );
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
        syncResults.push({
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
          syncResults.push({
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
          syncResults.push({
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
          syncResults.push({
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
          syncResults.push({
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
          syncResults.push({
            name: 'Multiple Named Exports: getLocales',
            passed,
            expected: expected.multipleNamedExports.getLocales,
            actual: actualLocales,
          });
        }
      }
    }

    // Test 5: Class Exports
    if (expected.classExports) {
      console.log('[MockTestingStory] Testing Class Exports...');
      console.log(
        '[MockTestingStory] DataProcessor type:',
        typeof DataProcessor,
        'is null:',
        DataProcessor === null,
        'is undefined:',
        DataProcessor === undefined
      );
      console.log(
        '[MockTestingStory] Calculator type:',
        typeof Calculator,
        'is null:',
        Calculator === null,
        'is undefined:',
        Calculator === undefined
      );

      if (expected.classExports.dataProcessorProcess !== undefined) {
        if (!DataProcessor || typeof DataProcessor !== 'function') {
          console.warn('[MockTestingStory] DataProcessor is not available, skipping test');
          syncResults.push({
            name: 'Class Exports: DataProcessor.process',
            passed: false,
            expected: expected.classExports.dataProcessorProcess,
            actual: 'DataProcessor not available',
          });
        } else {
          try {
            const processor = new DataProcessor(5);
            const actual = processor.process(10);
            const passed = actual === expected.classExports.dataProcessorProcess;
            console.log('[MockTestingStory] Class: DataProcessor.process comparison:', {
              expected: expected.classExports.dataProcessorProcess,
              actual,
              passed,
            });
            syncResults.push({
              name: 'Class Exports: DataProcessor.process',
              passed,
              expected: expected.classExports.dataProcessorProcess,
              actual,
            });
          } catch (e: any) {
            console.error('[MockTestingStory] Error instantiating DataProcessor:', e.message);
            syncResults.push({
              name: 'Class Exports: DataProcessor.process',
              passed: false,
              expected: expected.classExports.dataProcessorProcess,
              actual: `Error: ${e.message}`,
            });
          }
        }
      }

      if (expected.classExports.dataProcessorGetMultiplier !== undefined) {
        if (!DataProcessor || typeof DataProcessor !== 'function') {
          console.warn('[MockTestingStory] DataProcessor is not available, skipping test');
          syncResults.push({
            name: 'Class Exports: DataProcessor.getMultiplier',
            passed: false,
            expected: expected.classExports.dataProcessorGetMultiplier,
            actual: 'DataProcessor not available',
          });
        } else {
          try {
            const processor = new DataProcessor(7);
            const actual = processor.getMultiplier();
            const passed = actual === expected.classExports.dataProcessorGetMultiplier;
            console.log('[MockTestingStory] Class: DataProcessor.getMultiplier comparison:', {
              expected: expected.classExports.dataProcessorGetMultiplier,
              actual,
              passed,
            });
            syncResults.push({
              name: 'Class Exports: DataProcessor.getMultiplier',
              passed,
              expected: expected.classExports.dataProcessorGetMultiplier,
              actual,
            });
          } catch (e: any) {
            console.error('[MockTestingStory] Error instantiating DataProcessor:', e.message);
            syncResults.push({
              name: 'Class Exports: DataProcessor.getMultiplier',
              passed: false,
              expected: expected.classExports.dataProcessorGetMultiplier,
              actual: `Error: ${e.message}`,
            });
          }
        }
      }

      if (expected.classExports.calculatorAdd !== undefined) {
        if (!Calculator || typeof Calculator !== 'function') {
          console.warn('[MockTestingStory] Calculator is not available, skipping test');
          syncResults.push({
            name: 'Class Exports: Calculator.add',
            passed: false,
            expected: expected.classExports.calculatorAdd,
            actual: 'Calculator not available',
          });
        } else {
          try {
            const calculator = new Calculator();
            const actual = calculator.add(15, 25);
            const passed = actual === expected.classExports.calculatorAdd;
            console.log('[MockTestingStory] Class: Calculator.add comparison:', {
              expected: expected.classExports.calculatorAdd,
              actual,
              passed,
            });
            syncResults.push({
              name: 'Class Exports: Calculator.add',
              passed,
              expected: expected.classExports.calculatorAdd,
              actual,
            });
          } catch (e: any) {
            console.error('[MockTestingStory] Error instantiating Calculator:', e.message);
            syncResults.push({
              name: 'Class Exports: Calculator.add',
              passed: false,
              expected: expected.classExports.calculatorAdd,
              actual: `Error: ${e.message}`,
            });
          }
        }
      }

      if (expected.classExports.calculatorSubtract !== undefined) {
        if (!Calculator || typeof Calculator !== 'function') {
          console.warn('[MockTestingStory] Calculator is not available, skipping test');
          syncResults.push({
            name: 'Class Exports: Calculator.subtract',
            passed: false,
            expected: expected.classExports.calculatorSubtract,
            actual: 'Calculator not available',
          });
        } else {
          try {
            const calculator = new Calculator();
            const actual = calculator.subtract(50, 20);
            const passed = actual === expected.classExports.calculatorSubtract;
            console.log('[MockTestingStory] Class: Calculator.subtract comparison:', {
              expected: expected.classExports.calculatorSubtract,
              actual,
              passed,
            });
            syncResults.push({
              name: 'Class Exports: Calculator.subtract',
              passed,
              expected: expected.classExports.calculatorSubtract,
              actual,
            });
          } catch (e: any) {
            console.error('[MockTestingStory] Error instantiating Calculator:', e.message);
            syncResults.push({
              name: 'Class Exports: Calculator.subtract',
              passed: false,
              expected: expected.classExports.calculatorSubtract,
              actual: `Error: ${e.message}`,
            });
          }
        }
      }
    }

    // Test 6: Nested Package Mocks (synchronous part)
    if (expected.nestedMocks) {
      console.log('[MockTestingStory] Testing Nested Package Mocks...');

      if (expected.nestedMocks.processPayment !== undefined) {
        const actual = processPayment(100, 'USD');
        const passed = actual === expected.nestedMocks.processPayment;
        console.log('[MockTestingStory] Nested: processPayment comparison:', {
          expected: expected.nestedMocks.processPayment,
          actual,
          passed,
        });
        syncResults.push({
          name: 'Nested Mocks: processPayment',
          passed,
          expected: expected.nestedMocks.processPayment,
          actual,
        });
      }

      if (expected.nestedMocks.processDataWithMultiplier !== undefined) {
        const actual = processDataWithMultiplier(10, 3);
        const passed = actual === expected.nestedMocks.processDataWithMultiplier;
        console.log('[MockTestingStory] Nested: processDataWithMultiplier comparison:', {
          expected: expected.nestedMocks.processDataWithMultiplier,
          actual,
          passed,
        });
        syncResults.push({
          name: 'Nested Mocks: processDataWithMultiplier',
          passed,
          expected: expected.nestedMocks.processDataWithMultiplier,
          actual,
        });
      }
    }

    setResults(syncResults);
  }, [expected]);

  // Test 4: Async Functions
  useEffect(() => {
    if (expected.asyncFunctions) {
      console.log('[MockTestingStory] Testing Async Functions...');

      if (expected.asyncFunctions.fetchUserData !== undefined) {
        fetchUserData('user-123')
          .then((actual) => {
            console.log('[MockTestingStory] Async: fetchUserData result:', actual);
            const passed =
              JSON.stringify(actual) === JSON.stringify(expected.asyncFunctions!.fetchUserData);
            setResults((prev) => [
              ...prev,
              {
                name: 'Async Functions: fetchUserData',
                passed,
                expected: expected.asyncFunctions!.fetchUserData,
                actual,
              },
            ]);
          })
          .catch((error) => {
            console.error('[MockTestingStory] Async: fetchUserData error:', error);
            setResults((prev) => [
              ...prev,
              {
                name: 'Async Functions: fetchUserData',
                passed: false,
                expected: expected.asyncFunctions!.fetchUserData,
                actual: `Error: ${error.message}`,
              },
            ]);
          });
      }

      if (expected.asyncFunctions.fetchSettings !== undefined) {
        fetchSettings()
          .then((actual) => {
            console.log('[MockTestingStory] Async: fetchSettings result:', actual);
            const passed =
              JSON.stringify(actual) === JSON.stringify(expected.asyncFunctions!.fetchSettings);
            setResults((prev) => [
              ...prev,
              {
                name: 'Async Functions: fetchSettings',
                passed,
                expected: expected.asyncFunctions!.fetchSettings,
                actual,
              },
            ]);
          })
          .catch((error) => {
            console.error('[MockTestingStory] Async: fetchSettings error:', error);
            setResults((prev) => [
              ...prev,
              {
                name: 'Async Functions: fetchSettings',
                passed: false,
                expected: expected.asyncFunctions!.fetchSettings,
                actual: `Error: ${error.message}`,
              },
            ]);
          });
      }
    }

    // Test 6: Nested Package Mocks (async part)
    if (expected.nestedMocks?.getUserPaymentInfo !== undefined) {
      getUserPaymentInfo('user-456')
        .then((actual) => {
          console.log('[MockTestingStory] Nested: getUserPaymentInfo result:', actual);
          const passed = actual === expected.nestedMocks!.getUserPaymentInfo;
          setResults((prev) => [
            ...prev,
            {
              name: 'Nested Mocks: getUserPaymentInfo',
              passed,
              expected: expected.nestedMocks!.getUserPaymentInfo,
              actual,
            },
          ]);
        })
        .catch((error) => {
          console.error('[MockTestingStory] Nested: getUserPaymentInfo error:', error);
          setResults((prev) => [
            ...prev,
            {
              name: 'Nested Mocks: getUserPaymentInfo',
              passed: false,
              expected: expected.nestedMocks!.getUserPaymentInfo,
              actual: `Error: ${error.message}`,
            },
          ]);
        });
    }
  }, [expected.asyncFunctions, expected.nestedMocks]);

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
