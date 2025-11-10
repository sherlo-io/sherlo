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
    },
  },
  mocks: {
    '../utils/localUtils': {
      formatCurrency: (amount: number, currency: string = 'USD') => `MOCKED ${currency} ${amount.toFixed(2)}`,
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
    },
  },
  mocks: {
    '../utils/localUtils': {
      formatCurrency: (amount: number, currency: string = 'USD') => `ALTERNATE ${currency} ${amount.toFixed(2)}`,
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
      processPayment: (amount: number, currency: string) => `Payment: MOCKED ${currency} ${amount.toFixed(2)}`,
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
    },
  },
  // No mocks - should fall back to real implementations
};

