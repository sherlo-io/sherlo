import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Import all the things we might test
import { formatCurrency, APP_NAME, VERSION } from '../utils/localUtils';
import TestHelper from '../utils/testHelper';
import { getLocales, getCalendars } from 'expo-localization';
import { processOrder, sum, calculateDiscount } from '../utils/parameterizedUtils';
import { config, supportedLanguages, MAX_RETRIES, ENABLED } from '../utils/objectExportsUtils';
import { fetchUserData, fetchSettings } from '../utils/asyncUtils';
import { processPayment, getUserPaymentInfo } from '../utils/nestedUtils';
import { SPECIAL_NUMBERS, EMPTY_VALUES, createMultiplier } from '../utils/edgeCaseUtils';
import { client, QUERY_CONSTANT } from '../api/client';
import { client as apolloClient } from '../../apollo/client';
import { DataProcessor } from '../utils/dataProcessor';

interface TestResult {
  name: string;
  passed: boolean;
  expected: any;
  actual: any;
}

interface SimpleMockTestProps {
  testType?: string;
  expectedResult?: string;
}

export const SimpleMockTest: React.FC<SimpleMockTestProps> = ({ testType = 'BasicFunction', expectedResult }) => {
  const [results, setResults] = useState<TestResult[]>([]);

  useEffect(() => {
    console.log(`[SHERLO] SimpleMockTest: Starting test type "${testType}"`);
    const newResults: TestResult[] = [];

    try {
      switch (testType) {
      case 'BasicFunction':
        console.log('[SHERLO] SimpleMockTest: Calling formatCurrency(100, "EUR")');
        const currency = formatCurrency(100, 'EUR');
        console.log(`[SHERLO] SimpleMockTest: formatCurrency returned:`, currency);
        newResults.push({
          name: 'formatCurrency',
          passed: currency === 'MOCKED EUR 100.00',
          expected: 'MOCKED EUR 100.00',
          actual: currency,
        });
        break;

      case 'FunctionWithParameters':
        const currency2 = formatCurrency(99.99, 'USD');
        newResults.push({
          name: 'formatCurrency with params',
          passed: currency2 === 'MOCKED USD 99.99',
          expected: 'MOCKED USD 99.99',
          actual: currency2,
        });
        break;

      case 'Constants':
        newResults.push({
          name: 'APP_NAME',
          passed: APP_NAME === 'Mocked App Name',
          expected: 'Mocked App Name',
          actual: APP_NAME,
        });
        newResults.push({
          name: 'VERSION',
          passed: VERSION === '2.0.0',
          expected: '2.0.0',
          actual: VERSION,
        });
        break;

      case 'DefaultExport':
        console.log('[SHERLO] SimpleMockTest: Testing default export (TestHelper)');
        console.log('[SHERLO] SimpleMockTest: TestHelper type:', typeof TestHelper);
        console.log('[SHERLO] SimpleMockTest: TestHelper value:', TestHelper);
        console.log('[SHERLO] SimpleMockTest: TestHelper keys:', Object.keys(TestHelper));
        console.log('[SHERLO] SimpleMockTest: Calling helper methods');
        
        // Handle both wrapped (.default) and unwrapped default exports
        const helper = (TestHelper as any).default || TestHelper;
        const value = helper.getValue();
        console.log('[SHERLO] SimpleMockTest: helper.getValue() returned:', value);
        
        const number = helper.getNumber();
        console.log('[SHERLO] SimpleMockTest: helper.getNumber() returned:', number);
        
        const obj = helper.getObject();
        console.log('[SHERLO] SimpleMockTest: helper.getObject() returned:', obj);
        
        newResults.push({
          name: 'helper.getValue',
          passed: value === 'mocked-value',
          expected: 'mocked-value',
          actual: value,
        });
        newResults.push({
          name: 'helper.getNumber',
          passed: number === 42,
          expected: 42,
          actual: number,
        });
        newResults.push({
          name: 'helper.getObject',
          passed: obj?.key === 'mocked',
          expected: { key: 'mocked' },
          actual: obj,
        });
        break;

      case 'MultipleNamedExports':
        console.log('[SHERLO] SimpleMockTest: Testing multiple named exports (expo-localization)');
        console.log('[SHERLO] SimpleMockTest: getLocales type:', typeof getLocales);
        console.log('[SHERLO] SimpleMockTest: getLocales value:', getLocales);
        
        if (typeof getLocales !== 'function') {
          newResults.push({
            name: 'getLocales (export)',
            passed: false,
            expected: 'function',
            actual: `typeof getLocales = ${typeof getLocales}, value = ${getLocales}`,
          });
          break;
        }
        
        console.log('[SHERLO] SimpleMockTest: Calling getLocales()');
        const locales = getLocales();
        console.log('[SHERLO] SimpleMockTest: getLocales() returned:', locales);
        newResults.push({
          name: 'getLocales',
          passed: locales?.[0]?.languageCode === 'en' && locales?.[0]?.regionCode === 'US',
          expected: [{ languageCode: 'en', regionCode: 'US' }],
          actual: locales,
        });
        break;

      case 'ParameterizedFunctions':
        const order = processOrder('ORD-123', 5, 'high');
        const total = sum(1, 2, 3, 4, 5);
        const discount = calculateDiscount(100, true, 'COUPON');
        newResults.push({
          name: 'processOrder',
          passed: order === 'MOCKED Order ORD-123: 5 items (high priority)',
          expected: 'MOCKED Order ORD-123: 5 items (high priority)',
          actual: order,
        });
        newResults.push({
          name: 'sum',
          passed: total === 150,
          expected: 150,
          actual: total,
        });
        newResults.push({
          name: 'calculateDiscount',
          passed: discount === 70,
          expected: 70,
          actual: discount,
        });
        break;

      case 'ObjectExports':
        newResults.push({
          name: 'config.app.name',
          passed: config.app.name === 'MockedApp',
          expected: 'MockedApp',
          actual: config.app.name,
        });
        newResults.push({
          name: 'supportedLanguages',
          passed: JSON.stringify(supportedLanguages) === JSON.stringify(['en', 'de', 'fr']),
          expected: ['en', 'de', 'fr'],
          actual: supportedLanguages,
        });
        newResults.push({
          name: 'MAX_RETRIES',
          passed: MAX_RETRIES === 5,
          expected: 5,
          actual: MAX_RETRIES,
        });
        newResults.push({
          name: 'ENABLED',
          passed: ENABLED === false,
          expected: false,
          actual: ENABLED,
        });
        break;

      case 'AsyncFunctions':
        // Test async functions - use Promise.all to wait for all
        Promise.all([
          fetchUserData('user-123').catch((e) => ({ error: e.message })),
          fetchSettings().catch((e) => ({ error: e.message })),
        ]).then(([user, settings]) => {
          newResults.push({
            name: 'fetchUserData',
            passed: !('error' in user) && user?.id === 'user-123' && user?.name === 'Mocked User',
            expected: { id: 'user-123', name: 'Mocked User' },
            actual: user,
          });
          newResults.push({
            name: 'fetchSettings',
            passed: !('error' in settings) && settings?.theme === 'dark' && settings?.language === 'en',
            expected: { theme: 'dark', language: 'en' },
            actual: settings,
          });
          setResults([...newResults]);
        });
        break;

      case 'NestedMocks':
        const payment = processPayment(100, 'USD');
        newResults.push({
          name: 'processPayment',
          passed: payment === 'MOCKED Payment: USD 100',
          expected: 'MOCKED Payment: USD 100',
          actual: payment,
        });
        getUserPaymentInfo('user-456')
          .then((info) => {
            newResults.push({
              name: 'getUserPaymentInfo',
              passed: info === 'Mocked payment info',
              expected: 'Mocked payment info',
              actual: info,
            });
            setResults([...newResults]);
          })
          .catch((error) => {
            newResults.push({
              name: 'getUserPaymentInfo',
              passed: false,
              expected: 'Mocked payment info',
              actual: `Error: ${error.message}`,
            });
            setResults([...newResults]);
          });
        break;

      case 'EdgeCases':
        newResults.push({
          name: 'SPECIAL_NUMBERS.infinity',
          passed: SPECIAL_NUMBERS.infinity === Infinity,
          expected: Infinity,
          actual: SPECIAL_NUMBERS.infinity,
        });
        newResults.push({
          name: 'EMPTY_VALUES.emptyString',
          passed: EMPTY_VALUES.emptyString === 'mocked-empty',
          expected: 'mocked-empty',
          actual: EMPTY_VALUES.emptyString,
        });
        const multiplier = createMultiplier(5);
        const result = multiplier(10);
        newResults.push({
          name: 'createMultiplier',
          passed: result === 100, // 5 * 10 * 2 = 100
          expected: 100,
          actual: result,
        });
        break;

      case 'PartialMocking':
        console.log('[SHERLO] SimpleMockTest: Testing partial mocking (getLocales mocked, getCalendars real)');
        // getLocales should be mocked
        const mockedLocales = getLocales();
        console.log('[SHERLO] SimpleMockTest: getLocales returned:', mockedLocales);
        newResults.push({
          name: 'getLocales (mocked)',
          passed: mockedLocales?.[0]?.languageCode === 'fr' && mockedLocales?.[0]?.regionCode === 'FR',
          expected: [{ languageCode: 'fr', regionCode: 'FR' }],
          actual: mockedLocales,
        });
        
        // getCalendars should use real implementation (not mocked)
        if (typeof getCalendars !== 'function') {
          newResults.push({
            name: 'getCalendars (real - not mocked)',
            passed: false,
            expected: 'function (real implementation)',
            actual: `typeof getCalendars = ${typeof getCalendars}`,
          });
        } else {
          const realCalendars = getCalendars();
          console.log('[SHERLO] SimpleMockTest: getCalendars returned:', realCalendars);
          // Real implementation should return actual calendar data (not mocked)
          // We just verify it's an array and not the mocked value
          newResults.push({
            name: 'getCalendars (real - not mocked)',
            passed: Array.isArray(realCalendars) && realCalendars.length > 0,
            expected: 'Array with calendar data (real implementation)',
            actual: realCalendars,
          });
        }
        break;

      case 'NoMocks':
        // Should use real implementations
        const realCurrency = formatCurrency(100, 'EUR');
        newResults.push({
          name: 'formatCurrency (real)',
          passed: realCurrency === 'EUR 100.00', // Real format: `${currency} ${amount.toFixed(2)}`
          expected: 'EUR 100.00',
          actual: realCurrency,
        });
        break;

      case 'SmartImports':
        // Test: Smart import extraction - imported constants work in mocks
        const smartImportResult = client.query({ query: 'test' });
        newResults.push({
          name: 'client.query with imported constant',
          passed: smartImportResult === `Using imported constant: ${QUERY_CONSTANT}`,
          expected: `Using imported constant: ${QUERY_CONSTANT}`,
          actual: smartImportResult,
        });
        break;

      case 'FactoryWithSpread':
        // Test: Factory function with spread operator
        const factorySpreadResult = client.query({ query: 'test' });
        newResults.push({
          name: 'Factory with spread',
          passed: factorySpreadResult === `Factory with spread: ${QUERY_CONSTANT}`,
          expected: `Factory with spread: ${QUERY_CONSTANT}`,
          actual: factorySpreadResult,
        });
        break;

      case 'FactoryConditional':
        // Test: Factory function with conditional logic
        const conditionalResult = client.query({ query: 'test' });
        newResults.push({
          name: 'Factory conditional (test query)',
          passed: conditionalResult === `Conditional mock: ${QUERY_CONSTANT}`,
          expected: `Conditional mock: ${QUERY_CONSTANT}`,
          actual: conditionalResult,
        });
        break;

      case 'FactoryMultipleExports':
        // Test: Factory function overriding multiple exports
        const multiExportResult = client.query({ query: 'test' });
        newResults.push({
          name: 'Factory multiple exports - client.query',
          passed: multiExportResult === 'Multiple exports mocked',
          expected: 'Multiple exports mocked',
          actual: multiExportResult,
        });
        // Note: QUERY_CONSTANT override would need to be tested differently
        // since it's imported at module level
        break;

      case 'RobustResolution':
        console.log('[SHERLO] SimpleMockTest: Testing RobustResolution');
        const robustResult = formatCurrency(100, 'EUR');
        newResults.push({
          name: 'RobustResolution',
          passed: robustResult === expectedResult,
          expected: expectedResult,
          actual: robustResult,
        });
        break;

      case 'ClassMock':
        console.log('[SHERLO] SimpleMockTest: Testing Class Mock');
        
        // Test class instantiation and methods
        const processor = new DataProcessor('Test');
        console.log('[SHERLO] SimpleMockTest: Created DataProcessor instance');
        
        const processResult = processor.process({ value: 123 });
        console.log('[SHERLO] SimpleMockTest: processor.process result:', processResult);
        
        const validateResult = processor.validate({ value: 123 });
        console.log('[SHERLO] SimpleMockTest: processor.validate result:', validateResult);
        
        const transformResult = processor.transform(10, 5);
        console.log('[SHERLO] SimpleMockTest: processor.transform result:', transformResult);
        
        newResults.push({
          name: 'DataProcessor.process',
          passed: processResult === 'Mocked: processed data',
          expected: 'Mocked: processed data',
          actual: processResult,
        });
        
        newResults.push({
          name: 'DataProcessor.validate',
          passed: validateResult === true,
          expected: true,
          actual: validateResult,
        });
        
        newResults.push({
          name: 'DataProcessor.transform',
          passed: transformResult === 100,
          expected: 100,
          actual: transformResult,
        });
        break;

      case 'StaticMethodMock':
        console.log('[SHERLO] SimpleMockTest: Testing Static Method Mock');
        
        // Test static method on mocked class
        console.log('[SHERLO] SimpleMockTest: DataProcessor type:', typeof DataProcessor);
        console.log('[SHERLO] SimpleMockTest: DataProcessor.getInstance type:', typeof DataProcessor.getInstance);
        
        try {
          const staticInstance = DataProcessor.getInstance();
          console.log('[SHERLO] SimpleMockTest: Static instance created:', staticInstance);
          
          const staticResult = staticInstance.process();
          console.log('[SHERLO] SimpleMockTest: Static instance process result:', staticResult);
          
          newResults.push({
            name: 'DataProcessor.getInstance (static)',
            passed: typeof DataProcessor.getInstance === 'function',
            expected: 'function',
            actual: typeof DataProcessor.getInstance,
          });
          
          newResults.push({
            name: 'Static instance.process',
            passed: staticResult === 'Mocked via Static Method',
            expected: 'Mocked via Static Method',
            actual: staticResult,
          });
        } catch (error: any) {
          console.error('[SHERLO] SimpleMockTest: Static method error:', error);
          newResults.push({
            name: 'DataProcessor.getInstance (static)',
            passed: false,
            expected: 'function',
            actual: `Error: ${error.message}`,
          });
        }
        break;


      case 'ApolloClientMock':
        console.log('[SHERLO] SimpleMockTest: Testing Apollo Client Mock');
        
        // Test query method
        const queryPromise = apolloClient.query({
          query: 'GET_USER',
          variables: { id: '123' },
        });
        
        queryPromise.then((queryResult) => {
          console.log('[SHERLO] SimpleMockTest: Apollo query result:', queryResult);
          newResults.push({
            name: 'apolloClient.query',
            passed: queryResult.data?.user?.name === 'Mocked User',
            expected: 'Mocked User',
            actual: queryResult.data?.user?.name,
          });
          
          // Test mutate method
          const mutatePromise = apolloClient.mutate({
            mutation: 'UPDATE_USER',
            variables: { id: '123', name: 'Updated Name' },
          });
          
          mutatePromise.then((mutateResult) => {
            console.log('[SHERLO] SimpleMockTest: Apollo mutate result:', mutateResult);
            newResults.push({
              name: 'apolloClient.mutate',
              passed: mutateResult.data?.updateUser?.name === 'Mocked Updated User',
              expected: 'Mocked Updated User',
              actual: mutateResult.data?.updateUser?.name,
            });
            
            setResults(newResults);
          }).catch((error) => {
            console.error('[SHERLO] SimpleMockTest: Apollo mutate error:', error);
            newResults.push({
              name: 'apolloClient.mutate',
              passed: false,
              expected: 'No errors',
              actual: `Error: ${error.message}`,
            });
            setResults(newResults);
          });
        }).catch((error) => {
          console.error('[SHERLO] SimpleMockTest: Apollo query error:', error);
          newResults.push({
            name: 'Test execution error',
            passed: false,
            expected: 'No errors',
            actual: `Error: ${error.message}`,
          });
          setResults(newResults);
        });
        
        // Return early for async test
        return;

      case 'TypeAssertion':
        console.log('[SHERLO] SimpleMockTest: Testing TypeAssertion');
        const typeAssertionResult = formatCurrency(100, 'EUR');
        newResults.push({
          name: 'TypeAssertion',
          passed: typeAssertionResult === expectedResult,
          expected: expectedResult,
          actual: typeAssertionResult,
        });
        break;

      default:
        newResults.push({
          name: 'Unknown test type',
          passed: false,
          expected: 'Valid test type',
          actual: testType,
        });
    }
    
            // For non-async tests, set results immediately
            if (testType !== 'AsyncFunctions' && testType !== 'NestedMocks') {
              setResults(newResults);
            }
  } catch (error: any) {
    setResults([{
      name: 'Test execution error',
      passed: false,
      expected: 'No errors',
      actual: `Error: ${error.message}`,
    }]);
  }
  }, [testType]);

  const passedCount = results.filter((r) => r.passed).length;
  const allPassed = results.length > 0 && passedCount === results.length;

  // Log test results to console for easy debugging
  useEffect(() => {
    if (results.length > 0) {
      console.log('\n========================================')
      console.log(`📊 SimpleMockTest Results: ${testType}`);
      console.log('========================================')
      console.log(`Summary: ${passedCount}/${results.length} tests passed ${allPassed ? '✅' : '❌'}`);
      console.log('');
      
      results.forEach((result, index) => {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`${index + 1}. ${status} - ${result.name}`);
        
        if (!result.passed) {
          console.log(`   Expected: ${JSON.stringify(result.expected)}`);
          console.log(`   Actual:   ${JSON.stringify(result.actual)}`);
        }
      });
      
      console.log('========================================\n');
      
      // If there are failures, log a copyable summary
      if (!allPassed) {
        const failures = results.filter(r => !r.passed);
        console.log('🔴 FAILURES SUMMARY (copy this):');
        console.log(JSON.stringify({
          testType,
          totalTests: results.length,
          passed: passedCount,
          failed: failures.length,
          failures: failures.map(f => ({
            name: f.name,
            expected: f.expected,
            actual: f.actual,
          })),
        }, null, 2));
        console.log('');
      }
    }
  }, [results, testType, passedCount, allPassed]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Test: {testType}</Text>
      <Text style={styles.summary}>
        {passedCount}/{results.length} tests passed {allPassed ? '✅' : '❌'}
      </Text>
      {results.map((result, index) => (
        <View key={index} style={styles.testRow}>
          <Text style={styles.testName}>{result.name}</Text>
          <Text style={[styles.status, result.passed ? styles.passed : styles.failed]}>
            {result.passed ? '✅' : '❌'}
          </Text>
          {!result.passed && (
            <View style={styles.details}>
              <Text style={styles.detailText}>Expected: {JSON.stringify(result.expected)}</Text>
              <Text style={styles.detailText}>Actual: {JSON.stringify(result.actual)}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  summary: {
    fontSize: 16,
    marginBottom: 15,
  },
  testRow: {
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
  },
  testName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5,
  },
  status: {
    fontSize: 16,
    marginBottom: 5,
  },
  passed: {
    color: 'green',
  },
  failed: {
    color: 'red',
  },
  details: {
    marginTop: 5,
    paddingLeft: 10,
  },
  detailText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
});
