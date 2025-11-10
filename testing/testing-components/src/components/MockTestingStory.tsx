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
import {
  processOrder,
  sum,
  createUser,
  processItems,
  executeWithCallback,
  calculateDiscount,
} from '../utils/parameterizedUtils';
import {
  config,
  supportedLanguages,
  menuItems,
  nullableValue,
  undefinedValue,
  MAX_RETRIES,
  ENABLED,
  APP_TITLE,
} from '../utils/objectExportsUtils';
import {
  SPECIAL_NUMBERS,
  CURRENT_DATE,
  EMAIL_REGEX,
  EMPTY_VALUES,
  DEEP_NESTED,
  createMultiplier,
  createCounter,
  MIXED_ARRAY,
  OBJECT_WITH_GETTER,
} from '../utils/edgeCaseUtils';

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
    complexParameters?: {
      processOrder?: string;
      sum?: number;
      createUser?: string;
      processItems?: string;
      executeWithCallback?: string;
      calculateDiscount?: number;
    };
    objectExports?: {
      config?: {
        app?: { name?: string; version?: string; settings?: { theme?: string; language?: string } };
        api?: { baseUrl?: string; timeout?: number };
      };
      supportedLanguages?: string[];
      menuItems?: Array<{ id: number; label: string; path: string }>;
      nullableValue?: string | null;
      undefinedValue?: string | undefined;
      MAX_RETRIES?: number;
      ENABLED?: boolean;
      APP_TITLE?: string;
    };
    edgeCases?: {
      specialNumbers?: {
        nan?: number;
        infinity?: number;
        negativeInfinity?: number;
      };
      currentDate?: Date | string;
      emailRegex?: RegExp | string;
      emptyValues?: {
        emptyString?: string;
        emptyArray?: any[];
        emptyObject?: Record<string, any>;
      };
      deepNested?: {
        level1?: {
          level2?: {
            level3?: {
              level4?: {
                level5?: {
                  value?: string;
                  number?: number;
                };
              };
            };
          };
        };
      };
      createMultiplier?: number; // Expected result of createMultiplier(5)(10)
      createCounter?: number; // Expected result of createCounter()()
      mixedArray?: any[];
      objectWithGetter?: string; // Expected value from OBJECT_WITH_GETTER.value
    };
  };
}

const MockTestingStory: React.FC<MockTestingStoryProps> = ({ expected = {} }) => {
  const [results, setResults] = useState<TestResult[]>([]);

  // Collect all synchronous test results
  useEffect(() => {
    const syncResults: TestResult[] = [];

    // Test 1: Local Import
    if (expected.localImport) {
      const actualCurrency = formatCurrency(99.99, 'EUR');
      const actualDate = formatDate(new Date('2024-01-15'));
      const actualTotal = calculateTotal([10, 20, 30]);
      const actualAppName = APP_NAME;
      const actualVersion = VERSION;

      if (expected.localImport.formatCurrency !== undefined) {
        const passed = actualCurrency === expected.localImport.formatCurrency;

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

        syncResults.push({
          name: 'Local Import: calculateTotal',
          passed,
          expected: expected.localImport.calculateTotal,
          actual: actualTotal,
        });
      }
      if (expected.localImport.APP_NAME !== undefined) {
        const passed = actualAppName === expected.localImport.APP_NAME;

        syncResults.push({
          name: 'Local Import: APP_NAME',
          passed,
          expected: expected.localImport.APP_NAME,
          actual: actualAppName,
        });
      }
      if (expected.localImport.VERSION !== undefined) {
        const passed = actualVersion === expected.localImport.VERSION;

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
      if (TestHelper && typeof TestHelper === 'object') {
        const testHelperAny = TestHelper as any;

        // Check if TestHelper has a default property (Metro ES module interop)
        if (testHelperAny.default) {
        }
      }

      // Handle case where TestHelper might be undefined (no mocks, real module not available)
      if (!TestHelper || typeof TestHelper !== 'object') {
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

        const actualValue = helper.getValue?.();
        const actualNumber = helper.getNumber?.();
        const actualObject = helper.getObject?.();

        if (expected.defaultExport.getValue !== undefined) {
          const passed = actualValue === expected.defaultExport.getValue;

          syncResults.push({
            name: 'Default Export: getValue',
            passed,
            expected: expected.defaultExport.getValue,
            actual: actualValue,
          });
        }
        if (expected.defaultExport.getNumber !== undefined) {
          const passed = actualNumber === expected.defaultExport.getNumber;

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
      const actualLocales = getLocales();

      if (expected.multipleNamedExports.getLocales !== undefined) {
        // Special case: if expected is null, we're checking for real implementation (just verify it's an array)
        if (expected.multipleNamedExports.getLocales === null) {
          const passed = Array.isArray(actualLocales) && actualLocales.length > 0;

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
      if (expected.classExports.dataProcessorProcess !== undefined) {
        if (!DataProcessor || typeof DataProcessor !== 'function') {
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

            syncResults.push({
              name: 'Class Exports: DataProcessor.process',
              passed,
              expected: expected.classExports.dataProcessorProcess,
              actual,
            });
          } catch (e: any) {
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

            syncResults.push({
              name: 'Class Exports: DataProcessor.getMultiplier',
              passed,
              expected: expected.classExports.dataProcessorGetMultiplier,
              actual,
            });
          } catch (e: any) {
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

            syncResults.push({
              name: 'Class Exports: Calculator.add',
              passed,
              expected: expected.classExports.calculatorAdd,
              actual,
            });
          } catch (e: any) {
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

            syncResults.push({
              name: 'Class Exports: Calculator.subtract',
              passed,
              expected: expected.classExports.calculatorSubtract,
              actual,
            });
          } catch (e: any) {
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
      if (expected.nestedMocks.processPayment !== undefined) {
        const actual = processPayment(100, 'USD');
        const passed = actual === expected.nestedMocks.processPayment;

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

        syncResults.push({
          name: 'Nested Mocks: processDataWithMultiplier',
          passed,
          expected: expected.nestedMocks.processDataWithMultiplier,
          actual,
        });
      }
    }

    // Test 7: Complex Parameters
    if (expected.complexParameters) {
      if (expected.complexParameters.processOrder !== undefined) {
        const actual = processOrder('ORD-123', 5, 'high');
        const passed = actual === expected.complexParameters.processOrder;

        syncResults.push({
          name: 'Complex Parameters: processOrder (optional params)',
          passed,
          expected: expected.complexParameters.processOrder,
          actual,
        });
      }

      if (expected.complexParameters.sum !== undefined) {
        const actual = sum(1, 2, 3, 4, 5);
        const passed = actual === expected.complexParameters.sum;

        syncResults.push({
          name: 'Complex Parameters: sum (rest params)',
          passed,
          expected: expected.complexParameters.sum,
          actual,
        });
      }

      if (expected.complexParameters.createUser !== undefined) {
        const actual = createUser({ name: 'John Doe', age: 30, email: 'john@example.com' });
        const passed = actual === expected.complexParameters.createUser;

        syncResults.push({
          name: 'Complex Parameters: createUser (object param)',
          passed,
          expected: expected.complexParameters.createUser,
          actual,
        });
      }

      if (expected.complexParameters.processItems !== undefined) {
        const actual = processItems(['item1', 'item2', 'item3']);
        const passed = actual === expected.complexParameters.processItems;

        syncResults.push({
          name: 'Complex Parameters: processItems (array param)',
          passed,
          expected: expected.complexParameters.processItems,
          actual,
        });
      }

      if (expected.complexParameters.executeWithCallback !== undefined) {
        const actual = executeWithCallback(10, (result) => `Result: ${result}`);
        const passed = actual === expected.complexParameters.executeWithCallback;

        syncResults.push({
          name: 'Complex Parameters: executeWithCallback (function param)',
          passed,
          expected: expected.complexParameters.executeWithCallback,
          actual,
        });
      }

      if (expected.complexParameters.calculateDiscount !== undefined) {
        const actual = calculateDiscount(100, true, 'SAVE20');
        const passed = actual === expected.complexParameters.calculateDiscount;

        syncResults.push({
          name: 'Complex Parameters: calculateDiscount (conditional)',
          passed,
          expected: expected.complexParameters.calculateDiscount,
          actual,
        });
      }
    }

    // Test 8: Complex Object/Constant Exports
    if (expected.objectExports) {
      if (expected.objectExports.config !== undefined) {
        const actual = config;
        const expectedConfig = expected.objectExports.config;
        const passed =
          actual?.app?.name === expectedConfig?.app?.name &&
          actual?.app?.version === expectedConfig?.app?.version &&
          actual?.app?.settings?.theme === expectedConfig?.app?.settings?.theme &&
          actual?.api?.baseUrl === expectedConfig?.api?.baseUrl;

        syncResults.push({
          name: 'Object Exports: config (nested object)',
          passed,
          expected: expectedConfig,
          actual,
        });
      }

      if (expected.objectExports.supportedLanguages !== undefined) {
        const actual = supportedLanguages;
        const passed =
          JSON.stringify(actual) === JSON.stringify(expected.objectExports.supportedLanguages);

        syncResults.push({
          name: 'Object Exports: supportedLanguages (array)',
          passed,
          expected: expected.objectExports.supportedLanguages,
          actual,
        });
      }

      if (expected.objectExports.menuItems !== undefined) {
        const actual = menuItems;
        const passed = JSON.stringify(actual) === JSON.stringify(expected.objectExports.menuItems);

        syncResults.push({
          name: 'Object Exports: menuItems (array of objects)',
          passed,
          expected: expected.objectExports.menuItems,
          actual,
        });
      }

      if (expected.objectExports.nullableValue !== undefined) {
        const actual = nullableValue;
        const passed = actual === expected.objectExports.nullableValue;

        syncResults.push({
          name: 'Object Exports: nullableValue (null)',
          passed,
          expected: expected.objectExports.nullableValue,
          actual,
        });
      }

      if (expected.objectExports.undefinedValue !== undefined) {
        const actual = undefinedValue;
        const passed = actual === expected.objectExports.undefinedValue;

        syncResults.push({
          name: 'Object Exports: undefinedValue (undefined)',
          passed,
          expected: expected.objectExports.undefinedValue,
          actual,
        });
      }

      if (expected.objectExports.MAX_RETRIES !== undefined) {
        const actual = MAX_RETRIES;
        const passed = actual === expected.objectExports.MAX_RETRIES;

        syncResults.push({
          name: 'Object Exports: MAX_RETRIES (number)',
          passed,
          expected: expected.objectExports.MAX_RETRIES,
          actual,
        });
      }

      if (expected.objectExports.ENABLED !== undefined) {
        const actual = ENABLED;
        const passed = actual === expected.objectExports.ENABLED;

        syncResults.push({
          name: 'Object Exports: ENABLED (boolean)',
          passed,
          expected: expected.objectExports.ENABLED,
          actual,
        });
      }

      if (expected.objectExports.APP_TITLE !== undefined) {
        const actual = APP_TITLE;
        const passed = actual === expected.objectExports.APP_TITLE;

        syncResults.push({
          name: 'Object Exports: APP_TITLE (string)',
          passed,
          expected: expected.objectExports.APP_TITLE,
          actual,
        });
      }
    }

    // Test 9: Edge Cases
    if (expected.edgeCases) {
      // Special numbers
      if (expected.edgeCases.specialNumbers) {
        const actualNan = SPECIAL_NUMBERS.nan;
        const actualInfinity = SPECIAL_NUMBERS.infinity;
        const actualNegativeInfinity = SPECIAL_NUMBERS.negativeInfinity;

        if (expected.edgeCases.specialNumbers.nan !== undefined) {
          // NaN comparison requires isNaN check
          const passed = isNaN(actualNan) && isNaN(expected.edgeCases.specialNumbers.nan);

          syncResults.push({
            name: 'Edge Cases: SPECIAL_NUMBERS.nan',
            passed,
            expected: expected.edgeCases.specialNumbers.nan,
            actual: actualNan,
          });
        }
        if (expected.edgeCases.specialNumbers.infinity !== undefined) {
          const passed = actualInfinity === expected.edgeCases.specialNumbers.infinity;

          syncResults.push({
            name: 'Edge Cases: SPECIAL_NUMBERS.infinity',
            passed,
            expected: expected.edgeCases.specialNumbers.infinity,
            actual: actualInfinity,
          });
        }
        if (expected.edgeCases.specialNumbers.negativeInfinity !== undefined) {
          const passed =
            actualNegativeInfinity === expected.edgeCases.specialNumbers.negativeInfinity;

          syncResults.push({
            name: 'Edge Cases: SPECIAL_NUMBERS.negativeInfinity',
            passed,
            expected: expected.edgeCases.specialNumbers.negativeInfinity,
            actual: actualNegativeInfinity,
          });
        }
      }

      // Date object
      if (expected.edgeCases.currentDate !== undefined) {
        const actual = CURRENT_DATE;
        const expectedDate =
          typeof expected.edgeCases.currentDate === 'string'
            ? new Date(expected.edgeCases.currentDate)
            : expected.edgeCases.currentDate;
        const passed =
          actual instanceof Date &&
          expectedDate instanceof Date &&
          actual.getTime() === expectedDate.getTime();

        syncResults.push({
          name: 'Edge Cases: CURRENT_DATE',
          passed,
          expected:
            expectedDate instanceof Date
              ? expectedDate.toISOString()
              : expected.edgeCases.currentDate,
          actual: actual.toISOString(),
        });
      }

      // RegExp object
      if (expected.edgeCases.emailRegex !== undefined) {
        const actual = EMAIL_REGEX;
        const expectedRegex =
          typeof expected.edgeCases.emailRegex === 'string'
            ? new RegExp(expected.edgeCases.emailRegex)
            : expected.edgeCases.emailRegex;
        const testEmail = 'test@example.com';
        const passed =
          actual instanceof RegExp &&
          expectedRegex instanceof RegExp &&
          actual.test(testEmail) === expectedRegex.test(testEmail);

        syncResults.push({
          name: 'Edge Cases: EMAIL_REGEX',
          passed,
          expected:
            expectedRegex instanceof RegExp
              ? expectedRegex.toString()
              : expected.edgeCases.emailRegex,
          actual: actual.toString(),
        });
      }

      // Empty values
      if (expected.edgeCases.emptyValues) {
        if (expected.edgeCases.emptyValues.emptyString !== undefined) {
          const actual = EMPTY_VALUES.emptyString;
          const passed = actual === expected.edgeCases.emptyValues.emptyString;

          syncResults.push({
            name: 'Edge Cases: EMPTY_VALUES.emptyString',
            passed,
            expected: expected.edgeCases.emptyValues.emptyString,
            actual,
          });
        }
        if (expected.edgeCases.emptyValues.emptyArray !== undefined) {
          const actual = EMPTY_VALUES.emptyArray;
          const passed =
            Array.isArray(actual) &&
            actual.length === expected.edgeCases.emptyValues.emptyArray.length;

          syncResults.push({
            name: 'Edge Cases: EMPTY_VALUES.emptyArray',
            passed,
            expected: expected.edgeCases.emptyValues.emptyArray,
            actual,
          });
        }
        if (expected.edgeCases.emptyValues.emptyObject !== undefined) {
          const actual = EMPTY_VALUES.emptyObject;
          const passed =
            typeof actual === 'object' &&
            actual !== null &&
            Object.keys(actual).length ===
              Object.keys(expected.edgeCases.emptyValues.emptyObject).length;

          syncResults.push({
            name: 'Edge Cases: EMPTY_VALUES.emptyObject',
            passed,
            expected: expected.edgeCases.emptyValues.emptyObject,
            actual,
          });
        }
      }

      // Deeply nested
      if (expected.edgeCases.deepNested) {
        const actual = DEEP_NESTED;
        const expectedNested = expected.edgeCases.deepNested;
        const passed =
          actual?.level1?.level2?.level3?.level4?.level5?.value ===
            expectedNested?.level1?.level2?.level3?.level4?.level5?.value &&
          actual?.level1?.level2?.level3?.level4?.level5?.number ===
            expectedNested?.level1?.level2?.level3?.level4?.level5?.number;

        syncResults.push({
          name: 'Edge Cases: DEEP_NESTED',
          passed,
          expected: expectedNested?.level1?.level2?.level3?.level4?.level5,
          actual: actual?.level1?.level2?.level3?.level4?.level5,
        });
      }

      // Higher-order functions
      if (expected.edgeCases.createMultiplier !== undefined) {
        const multiplier = createMultiplier(5);
        const actual = multiplier(10);
        const passed = actual === expected.edgeCases.createMultiplier;

        syncResults.push({
          name: 'Edge Cases: createMultiplier(5)(10)',
          passed,
          expected: expected.edgeCases.createMultiplier,
          actual,
        });
      }

      if (expected.edgeCases.createCounter !== undefined) {
        const counter = createCounter();
        const actual = counter();
        const passed = actual === expected.edgeCases.createCounter;

        syncResults.push({
          name: 'Edge Cases: createCounter()()',
          passed,
          expected: expected.edgeCases.createCounter,
          actual,
        });
      }

      // Mixed array
      if (expected.edgeCases.mixedArray !== undefined) {
        const actual = MIXED_ARRAY;
        const passed =
          Array.isArray(actual) && actual.length === expected.edgeCases.mixedArray.length;

        syncResults.push({
          name: 'Edge Cases: MIXED_ARRAY',
          passed,
          expected: expected.edgeCases.mixedArray,
          actual,
        });
      }

      // Object with getter
      if (expected.edgeCases.objectWithGetter !== undefined) {
        const actual = OBJECT_WITH_GETTER.value;
        const passed = actual === expected.edgeCases.objectWithGetter;

        syncResults.push({
          name: 'Edge Cases: OBJECT_WITH_GETTER.value',
          passed,
          expected: expected.edgeCases.objectWithGetter,
          actual,
        });
      }
    }

    setResults(syncResults);
  }, [expected]);

  // Test 4: Async Functions
  useEffect(() => {
    if (expected.asyncFunctions) {
      if (expected.asyncFunctions.fetchUserData !== undefined) {
        fetchUserData('user-123')
          .then((actual) => {
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
