import type { Meta } from '@storybook/react';
import { StoryDecorator } from '@sherlo/testing-components';
import { SimpleMockTest } from './SimpleMockTest';

export default {
  component: SimpleMockTest,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof SimpleMockTest>;

// Variant 1: Basic Function Mock
// Tests: Simple function mock with no parameters
export const BasicFunction = {
  args: {
    testType: 'BasicFunction',
  },
  mocks: {
    '../utils/localUtils': {
      formatCurrency: () => 'MOCKED EUR 100.00',
    },
  },
};

// Variant 2: Function with Parameters
// Tests: Function mock that receives and uses parameters
export const FunctionWithParameters = {
  args: {
    testType: 'FunctionWithParameters',
  },
  mocks: {
    '../utils/localUtils': {
      formatCurrency: (amount: number, currency: string) => `MOCKED ${currency} ${amount.toFixed(2)}`,
    },
  },
};

// Variant 3: Constants
// Tests: Constant mocks (APP_NAME, VERSION)
export const Constants = {
  args: {
    testType: 'Constants',
  },
  mocks: {
    '../utils/localUtils': {
      APP_NAME: 'Mocked App Name',
      VERSION: '2.0.0',
    },
  },
};

// Variant 4: Default Export
// Tests: Default export mock (testHelper)
export const DefaultExport = {
  args: {
    testType: 'DefaultExport',
  },
  mocks: {
    '../utils/testHelper': {
      default: {
        getValue: () => 'mocked-value',
        getNumber: () => 42,
        getObject: () => ({ key: 'mocked' }),
      },
    },
  },
};

// Variant 5: Multiple Named Exports
// Tests: Package with multiple named exports (expo-localization)
export const MultipleNamedExports = {
  args: {
    testType: 'MultipleNamedExports',
  },
  mocks: {
    'expo-localization': {
      getLocales: () => [{ languageCode: 'en', regionCode: 'US' }],
    },
  },
};

// Variant 6: Parameterized Functions
// Tests: Functions with complex parameters (parameterizedUtils)
export const ParameterizedFunctions = {
  args: {
    testType: 'ParameterizedFunctions',
  },
  mocks: {
    '../utils/parameterizedUtils': {
      processOrder: (orderId: string, quantity: number = 1, priority: string = 'medium') =>
        `MOCKED Order ${orderId}: ${quantity} items (${priority} priority)`,
      sum: (...numbers: number[]) => 150,
      calculateDiscount: (price: number, isMember: boolean = false, couponCode?: string) => 70,
    },
  },
};

// Variant 7: Object Exports
// Tests: Object exports (objectExportsUtils)
export const ObjectExports = {
  args: {
    testType: 'ObjectExports',
  },
  mocks: {
    '../utils/objectExportsUtils': {
      config: {
        app: { name: 'MockedApp', version: '2.0.0' },
        api: { baseUrl: 'https://mocked-api.com', timeout: 10000 },
      },
      supportedLanguages: ['en', 'de', 'fr'],
      MAX_RETRIES: 5,
      ENABLED: false,
    },
  },
};

// Variant 8: Async Functions
// Tests: Async function mocks (asyncUtils)
export const AsyncFunctions = {
  args: {
    testType: 'AsyncFunctions',
  },
  mocks: {
    '../utils/asyncUtils': {
      fetchUserData: async function (userId: string) {
        return { id: userId, name: 'Mocked User' };
      },
      fetchSettings: async function () {
        return { theme: 'dark', language: 'en' };
      },
    },
  },
};

// Variant 9: Nested Mocks
// Tests: Nested package mocks (nestedUtils)
export const NestedMocks = {
  args: {
    testType: 'NestedMocks',
  },
  mocks: {
    '../utils/nestedUtils': {
      processPayment: (amount: number, currency: string) => `MOCKED Payment: ${currency} ${amount}`,
      getUserPaymentInfo: async function (userId: string) {
        return 'Mocked payment info';
      },
    },
  },
};

// Variant 10: Edge Cases
// Tests: Edge case mocks (edgeCaseUtils)
export const EdgeCases = {
  args: {
    testType: 'EdgeCases',
  },
  mocks: {
    '../utils/edgeCaseUtils': {
      SPECIAL_NUMBERS: {
        nan: NaN,
        infinity: Infinity,
        negativeInfinity: -Infinity,
      },
      CURRENT_DATE: new Date('2024-01-01T00:00:00Z'),
      EMPTY_VALUES: {
        emptyString: 'mocked-empty',
        emptyArray: [1, 2, 3],
        emptyObject: { mocked: true },
      },
      createMultiplier: (factor: number) => {
        return (value: number) => value * factor * 2;
      },
    },
  },
};

// Variant 11: Partial Mocking
// Tests: Mock one export (getLocales) but not another (getCalendars) - unmocked should use real implementation
export const PartialMocking = {
  args: {
    testType: 'PartialMocking',
  },
  mocks: {
    'expo-localization': {
      getLocales: () => [{ languageCode: 'fr', regionCode: 'FR' }], // Mock this
      // getCalendars is NOT mocked - should use real implementation
    },
  },
};

// Variant 12: No Mocks (Real Module Fallback)
// Tests: No mocks defined - should use real module
export const NoMocks = {
  args: {
    testType: 'NoMocks',
  },
  // No mocks - should fall back to real implementations
};

