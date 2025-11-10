import type { Meta } from '@storybook/react';
import { StoryDecorator, MockTestingStory } from '@sherlo/testing-components';

export default {
  component: MockTestingStory,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof MockTestingStory>;

export const VariantA = {
  args: {
    expected: {
      localImport: {
        formatCurrency: 'MOCKED EUR 99.99',
        formatDate: 'MOCKED DATE',
        calculateTotal: 999,
        APP_NAME: 'Mocked App',
        VERSION: '2.0.0',
      },
      defaultExport: {
        getValue: 'mocked-value-1',
        getNumber: 100,
        getObject: { key: 'mocked-1' },
      },
      multipleNamedExports: {
        getLocales: [{ languageCode: 'de', regionCode: 'DE' }],
      },
      complexParameters: {
        processOrder: 'MOCKED Order ORD-123: 5 items (high priority)',
        sum: 150, // Mocked sum of 1+2+3+4+5 = 150 instead of 15
        createUser: 'MOCKED John Doe (30) - john@example.com',
        processItems: 'MOCKED Processed 3 items: item1, item2, item3',
        executeWithCallback: 'MOCKED Result: 20',
        calculateDiscount: 70, // Mocked: 100 * 0.7 = 70 (instead of real 70% discount)
      },
      objectExports: {
        config: {
          app: { name: 'MockedApp', version: '2.0.0', settings: { theme: 'dark', language: 'fr' } },
          api: { baseUrl: 'https://mocked-api.com', timeout: 10000 },
        },
        supportedLanguages: ['en', 'de', 'it'], // Mocked array
        menuItems: [
          { id: 1, label: 'Mocked Home', path: '/home' },
          { id: 2, label: 'Mocked About', path: '/about' },
        ],
        nullableValue: 'mocked-string', // Mocked: null -> 'mocked-string'
        undefinedValue: 'mocked-undefined', // Mocked: undefined -> 'mocked-undefined'
        MAX_RETRIES: 5, // Mocked: 3 -> 5
        ENABLED: false, // Mocked: true -> false
        APP_TITLE: 'Mocked App Title',
      },
      edgeCases: {
        specialNumbers: {
          nan: NaN,
          infinity: Infinity,
          negativeInfinity: -Infinity,
        },
        currentDate: new Date('2024-02-20T12:00:00Z'), // Mocked date
        emailRegex: /^mocked@test\.com$/, // Mocked regex
        emptyValues: {
          emptyString: 'mocked-empty', // Mocked: '' -> 'mocked-empty'
          emptyArray: [1, 2], // Mocked: [] -> [1, 2]
          emptyObject: { mocked: true }, // Mocked: {} -> { mocked: true }
        },
        deepNested: {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: {
                    value: 'mocked-deep-value',
                    number: 100,
                  },
                },
              },
            },
          },
        },
        createMultiplier: 100, // Mocked: createMultiplier(5)(10) = 100 instead of 50 (factor * 2)
        createCounter: 5, // Mocked: createCounter()() = 5 instead of 1
        mixedArray: ['mocked', 'array'],
        objectWithGetter: 'mocked-getter-value',
      },
    },
  },
  mocks: {
    '../utils/localUtils': {
      formatCurrency: (amount: number, currency: string = 'USD') =>
        `MOCKED ${currency} ${amount.toFixed(2)}`,
      formatDate: (date: Date) => 'MOCKED DATE',
      calculateTotal: (items: number[]) => 999,
      APP_NAME: 'Mocked App',
      VERSION: '2.0.0',
    },
    '../utils/testHelper': {
      default: {
        getValue: () => 'mocked-value-1',
        getNumber: () => 100,
        getObject: () => ({ key: 'mocked-1' }),
      },
    },
    'expo-localization': {
      getLocales: () => [{ languageCode: 'de', regionCode: 'DE' }],
    },
    '../utils/parameterizedUtils': {
      processOrder: (
        orderId: string,
        quantity: number = 1,
        priority: 'low' | 'medium' | 'high' = 'medium'
      ) => `MOCKED Order ${orderId}: ${quantity} items (${priority} priority)`,
      sum: (...numbers: number[]) => 150, // Mocked to always return 150
      createUser: (userData: { name: string; age: number; email?: string }) =>
        `MOCKED ${userData.name} (${userData.age}) - ${userData.email || 'no-email'}`,
      processItems: (items: string[]) =>
        `MOCKED Processed ${items.length} items: ${items.join(', ')}`,
      executeWithCallback: (value: number, callback: (result: number) => string) =>
        'MOCKED Result: 20',
      calculateDiscount: (price: number, isMember: boolean = false, couponCode?: string) => 70,
    },
    '../utils/objectExportsUtils': {
      config: {
        app: {
          name: 'MockedApp',
          version: '2.0.0',
          settings: {
            theme: 'dark',
            language: 'fr',
          },
        },
        api: {
          baseUrl: 'https://mocked-api.com',
          timeout: 10000,
        },
      },
      supportedLanguages: ['en', 'de', 'it'],
      menuItems: [
        { id: 1, label: 'Mocked Home', path: '/home' },
        { id: 2, label: 'Mocked About', path: '/about' },
      ],
      nullableValue: 'mocked-string',
      undefinedValue: 'mocked-undefined',
      MAX_RETRIES: 5,
      ENABLED: false,
      APP_TITLE: 'Mocked App Title',
    },
    '../utils/edgeCaseUtils': {
      SPECIAL_NUMBERS: {
        nan: NaN,
        infinity: Infinity,
        negativeInfinity: -Infinity,
        zero: 0,
        negativeZero: -0,
      },
      CURRENT_DATE: new Date('2024-02-20T12:00:00Z'),
      EMAIL_REGEX: /^mocked@test\.com$/,
      EMPTY_VALUES: {
        emptyString: 'mocked-empty',
        emptyArray: [1, 2],
        emptyObject: { mocked: true },
        nullValue: null,
        undefinedValue: undefined,
      },
      DEEP_NESTED: {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'mocked-deep-value',
                  number: 100,
                },
              },
            },
          },
        },
      },
      createMultiplier: (factor: number) => {
        return (value: number) => value * factor * 2; // Mocked: multiply by factor * 2
      },
      createCounter: () => {
        let count = 4; // Start at 4 instead of 0
        return () => {
          count++;
          return count;
        };
      },
      MIXED_ARRAY: ['mocked', 'array'],
      OBJECT_WITH_GETTER: {
        _value: 'mocked-getter-value',
        get value() {
          return this._value;
        },
      },
    },
  },
};

export const VariantB = {
  args: {
    expected: {
      localImport: {
        formatCurrency: 'ALTERNATE EUR 99.99',
        formatDate: 'ALTERNATE DATE',
        calculateTotal: 1234,
        APP_NAME: 'Alternate App',
        VERSION: '3.0.0',
      },
      defaultExport: {
        getValue: 'mocked-value-2',
        getNumber: 200,
        getObject: { key: 'mocked-2' },
      },
      multipleNamedExports: {
        getLocales: [{ languageCode: 'ja', regionCode: 'JP' }],
      },
      complexParameters: {
        processOrder: 'ALTERNATE Order ORD-123: 5 items (high priority)',
        sum: 250, // Mocked sum of 1+2+3+4+5 = 250 instead of 15
        createUser: 'ALTERNATE John Doe (30) - john@example.com',
        processItems: 'ALTERNATE Processed 3 items: item1, item2, item3',
        executeWithCallback: 'ALTERNATE Result: 20',
        calculateDiscount: 60, // Mocked: 100 * 0.6 = 60
      },
      objectExports: {
        config: {
          app: {
            name: 'AlternateApp',
            version: '3.0.0',
            settings: { theme: 'auto', language: 'ja' },
          },
          api: { baseUrl: 'https://alternate-api.com', timeout: 15000 },
        },
        supportedLanguages: ['ja', 'ko', 'zh'], // Alternate array
        menuItems: [
          { id: 1, label: 'Alternate Home', path: '/home' },
          { id: 3, label: 'Alternate Contact', path: '/contact' },
        ],
        nullableValue: 'alternate-string',
        undefinedValue: 'alternate-undefined',
        MAX_RETRIES: 7,
        ENABLED: true,
        APP_TITLE: 'Alternate App Title',
      },
      edgeCases: {
        specialNumbers: {
          nan: NaN,
          infinity: Infinity,
          negativeInfinity: -Infinity,
        },
        currentDate: new Date('2024-03-15T18:30:00Z'), // Alternate mocked date
        emailRegex: /^alternate@test\.com$/, // Alternate mocked regex
        emptyValues: {
          emptyString: 'alternate-empty',
          emptyArray: [3, 4, 5],
          emptyObject: { alternate: true },
        },
        deepNested: {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: {
                    value: 'alternate-deep-value',
                    number: 200,
                  },
                },
              },
            },
          },
        },
        createMultiplier: 100, // Alternate: createMultiplier(5)(10) = 100
        createCounter: 10, // Alternate: createCounter()() = 10
        mixedArray: ['alternate', 'array', 'values'],
        objectWithGetter: 'alternate-getter-value',
      },
    },
  },
  mocks: {
    '../utils/localUtils': {
      formatCurrency: (amount: number, currency: string = 'USD') =>
        `ALTERNATE ${currency} ${amount.toFixed(2)}`,
      formatDate: (date: Date) => 'ALTERNATE DATE',
      calculateTotal: (items: number[]) => 1234,
      APP_NAME: 'Alternate App',
      VERSION: '3.0.0',
    },
    '../utils/testHelper': {
      default: {
        getValue: () => 'mocked-value-2',
        getNumber: () => 200,
        getObject: () => ({ key: 'mocked-2' }),
      },
    },
    'expo-localization': {
      getLocales: () => [{ languageCode: 'ja', regionCode: 'JP' }],
    },
    '../utils/parameterizedUtils': {
      processOrder: (
        orderId: string,
        quantity: number = 1,
        priority: 'low' | 'medium' | 'high' = 'medium'
      ) => `ALTERNATE Order ${orderId}: ${quantity} items (${priority} priority)`,
      sum: (...numbers: number[]) => 250, // Mocked to always return 250
      createUser: (userData: { name: string; age: number; email?: string }) =>
        `ALTERNATE ${userData.name} (${userData.age}) - ${userData.email || 'no-email'}`,
      processItems: (items: string[]) =>
        `ALTERNATE Processed ${items.length} items: ${items.join(', ')}`,
      executeWithCallback: (value: number, callback: (result: number) => string) =>
        'ALTERNATE Result: 20',
      calculateDiscount: (price: number, isMember: boolean = false, couponCode?: string) => 60,
    },
    '../utils/objectExportsUtils': {
      config: {
        app: {
          name: 'AlternateApp',
          version: '3.0.0',
          settings: {
            theme: 'auto',
            language: 'ja',
          },
        },
        api: {
          baseUrl: 'https://alternate-api.com',
          timeout: 15000,
        },
      },
      supportedLanguages: ['ja', 'ko', 'zh'],
      menuItems: [
        { id: 1, label: 'Alternate Home', path: '/home' },
        { id: 3, label: 'Alternate Contact', path: '/contact' },
      ],
      nullableValue: 'alternate-string',
      undefinedValue: 'alternate-undefined',
      MAX_RETRIES: 7,
      ENABLED: true,
      APP_TITLE: 'Alternate App Title',
    },
    '../utils/edgeCaseUtils': {
      SPECIAL_NUMBERS: {
        nan: NaN,
        infinity: Infinity,
        negativeInfinity: -Infinity,
        zero: 0,
        negativeZero: -0,
      },
      CURRENT_DATE: new Date('2024-03-15T18:30:00Z'),
      EMAIL_REGEX: /^alternate@test\.com$/,
      EMPTY_VALUES: {
        emptyString: 'alternate-empty',
        emptyArray: [3, 4, 5],
        emptyObject: { alternate: true },
        nullValue: null,
        undefinedValue: undefined,
      },
      DEEP_NESTED: {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'alternate-deep-value',
                  number: 200,
                },
              },
            },
          },
        },
      },
      createMultiplier: (factor: number) => {
        return (value: number) => value * factor * 2; // Alternate: multiply by factor * 2
      },
      createCounter: () => {
        let count = 9; // Start at 9 instead of 0
        return () => {
          count++;
          return count;
        };
      },
      MIXED_ARRAY: ['alternate', 'array', 'values'],
      OBJECT_WITH_GETTER: {
        _value: 'alternate-getter-value',
        get value() {
          return this._value;
        },
      },
    },
  },
};

export const AdvancedMocksVariant = {
  args: {
    expected: {
      asyncFunctions: {
        fetchUserData: { id: 'user-123', name: 'Mocked User' },
        fetchSettings: { theme: 'dark', language: 'fr' },
      },
      classExports: {
        dataProcessorProcess: 50, // 10 * 5 = 50
        dataProcessorGetMultiplier: 7,
        calculatorAdd: 40, // 15 + 25 = 40
        calculatorSubtract: 30, // 50 - 20 = 30
      },
      nestedMocks: {
        processPayment: 'Payment: MOCKED USD 100.00',
        getUserPaymentInfo: 'User Mocked User payment info',
        processDataWithMultiplier: 30, // 10 * 3 = 30
      },
    },
  },
  mocks: {
    '../utils/asyncUtils': {
      fetchUserData: async (userId: string) => ({ id: userId, name: 'Mocked User' }),
      fetchSettings: async () => ({ theme: 'dark', language: 'fr' }),
    },
    '../utils/classUtils': {
      DataProcessor: class {
        private multiplier: number;
        constructor(multiplier: number = 1) {
          this.multiplier = multiplier;
        }
        process(value: number): number {
          return value * this.multiplier;
        }
        getMultiplier(): number {
          return this.multiplier;
        }
        static createDefault() {
          return new (this as any)(1);
        }
      },
      Calculator: class {
        add(a: number, b: number): number {
          return a + b;
        }
        subtract(a: number, b: number): number {
          return a - b;
        }
      },
    },
    '../utils/nestedUtils': {
      processPayment: (amount: number, currency: string) =>
        `Payment: MOCKED ${currency} ${amount.toFixed(2)}`,
      getUserPaymentInfo: async (userId: string) => {
        // Note: Can't use require() in React Native runtime
        // For nested mocks, we'll return the expected value directly
        return 'User Mocked User payment info';
      },
      processDataWithMultiplier: (value: number, multiplier: number) => {
        // Note: Can't use require() in React Native runtime
        // For nested mocks with classes, we'll calculate the expected value directly
        // Expected: 10 * 3 = 30
        return value * multiplier;
      },
    },
  },
};

export const NoMocksVariant = {
  args: {
    // Expected values matching real implementations
    expected: {
      localImport: {
        formatCurrency: 'EUR 99.99', // Real implementation format: `${currency} ${amount.toFixed(2)}`
        formatDate: null, // Real implementation uses toLocaleDateString - format varies, just check it's valid
        calculateTotal: 60, // Real: 10 + 20 + 30 = 60
        APP_NAME: 'Original App', // Real value
        VERSION: '1.0.0', // Real value
      },
      defaultExport: {
        getValue: 'original-value', // Real value
        getNumber: 42, // Real value
        getObject: { key: 'original' }, // Real value
      },
      multipleNamedExports: {
        // Real getLocales() - will be actual device locale
        // We can't predict this exactly, so we'll just check it's an array with locale objects
        getLocales: null, // Special marker - we'll check it's not null and is an array
      },
      complexParameters: {
        processOrder: 'Order ORD-123: 5 items (high priority)', // Real implementation
        sum: 15, // Real: 1+2+3+4+5 = 15
        createUser: 'John Doe (30) - john@example.com', // Real implementation
        processItems: 'Processed 3 items: item1, item2, item3', // Real implementation
        executeWithCallback: 'Result: 20', // Real: 10*2 = 20, callback returns "Result: 20"
        calculateDiscount: 70, // Real: 100 * (1 - 0.3) = 70 (member 10% + coupon 20% = 30%)
      },
      objectExports: {
        config: {
          app: { name: 'MyApp', version: '1.0.0', settings: { theme: 'light', language: 'en' } },
          api: { baseUrl: 'https://api.example.com', timeout: 5000 },
        },
        supportedLanguages: ['en', 'fr', 'de', 'es', 'ja'], // Real array
        menuItems: [
          { id: 1, label: 'Home', path: '/' },
          { id: 2, label: 'About', path: '/about' },
          { id: 3, label: 'Contact', path: '/contact' },
        ],
        nullableValue: null, // Real: null
        undefinedValue: undefined, // Real: undefined
        MAX_RETRIES: 3, // Real: 3
        ENABLED: true, // Real: true
        APP_TITLE: 'Original App Title', // Real value
      },
      edgeCases: {
        specialNumbers: {
          nan: NaN, // Real: NaN
          infinity: Infinity, // Real: Infinity
          negativeInfinity: -Infinity, // Real: -Infinity
        },
        currentDate: new Date('2024-01-15T10:30:00Z'), // Real date from edgeCaseUtils
        emailRegex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // Real regex from edgeCaseUtils
        emptyValues: {
          emptyString: '', // Real: empty string
          emptyArray: [], // Real: empty array
          emptyObject: {}, // Real: empty object
        },
        deepNested: {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: {
                    value: 'deep-value', // Real value
                    number: 42, // Real value
                  },
                },
              },
            },
          },
        },
        createMultiplier: 50, // Real: createMultiplier(5)(10) = 5 * 10 = 50
        createCounter: 1, // Real: createCounter()() = 1 (first call)
        mixedArray: [
          'string',
          42,
          true,
          null,
          undefined,
          NaN,
          Infinity,
          { nested: 'object' },
          [1, 2, 3],
        ], // Real mixed array
        objectWithGetter: 'getter-value', // Real value from OBJECT_WITH_GETTER.value
      },
    },
  },
  // No mocks - should fall back to real implementations
};
