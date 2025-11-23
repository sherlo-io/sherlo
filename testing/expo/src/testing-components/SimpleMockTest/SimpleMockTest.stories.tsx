import type { Meta, StoryObj } from '@storybook/react-native';
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
    'src/testing-components/utils/localUtils': {
      formatCurrency: () => 'MOCKED EUR 100.00',
    },
  },
};

// Test: Robust Resolution
// We use the project-root relative path to define the mock.
// The component imports from '../utils/localUtils' (relative to itself).
// We define the mock as 'testing/expo/src/testing-components/utils/localUtils' (relative to project root).
// This verifies that our robust resolution logic correctly resolves both to the same absolute path.
export const RobustResolution = {
  args: {
    testType: 'RobustResolution',
    expectedResult: 'MOCKED via Robust Resolution',
  },
  mocks: {
    'src/testing-components/utils/localUtils': {
      formatCurrency: () => 'MOCKED via Robust Resolution',
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
    'src/testing-components/utils/localUtils': {
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
    'src/testing-components/utils/localUtils': {
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
    'src/testing-components/utils/testHelper': {
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
    'src/testing-components/utils/parameterizedUtils': {
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
    'src/testing-components/utils/objectExportsUtils': {
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
    'src/testing-components/utils/asyncUtils': {
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
    'src/testing-components/utils/nestedUtils': {
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
    'src/testing-components/utils/edgeCaseUtils': {
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

// Variant 12: Apollo Client Mock
// Tests: Mocking a GraphQL client instance with query/mutate methods
export const ApolloClientMock = {
  args: {
    testType: 'ApolloClientMock',
  },
  mocks: {
    'src/apollo/client': {
      client: {
        query: async ({ query, variables }: any) => {
          console.log(`[MOCK] Apollo query called: ${query}`, variables);
          return {
            data: {
              user: {
                id: variables?.id || '123',
                name: 'Mocked User',
                email: 'mocked@example.com',
              },
            },
          };
        },
        mutate: async ({ mutation, variables }: any) => {
          console.log(`[MOCK] Apollo mutate called: ${mutation}`, variables);
          return {
            data: {
              updateUser: {
                id: variables?.id || '123',
                name: 'Mocked Updated User',
              },
            },
          };
        },
      },
    },
  },
};

// Variant 13: No Mocks (Real Module Fallback)
// Tests: No mocks defined - should use real module
export const NoMocks = {
  args: {
    testType: 'NoMocks',
  },
  // No mocks - should fall back to real implementations
};

// Variant 13: Smart Import Extraction
// Tests: Imported constants work in mocks
export const SmartImports = {
  args: {
    testType: 'SmartImports',
  },
  mocks: {
    'src/testing-components/api/client': {
      client: {
        query: () => `Using imported constant: MY_QUERY`,
      },
    },
  },
};

// Variant 14: Factory Function with Spread
// Tests: Factory function receives original module, spread operator preserves methods
export const FactoryWithSpread = {
  args: {
    testType: 'FactoryWithSpread',
  },
  mocks: {
    'src/testing-components/api/client': (original: any) => ({
      ...original,
      client: {
        ...original.client,
        query: () => `Factory with spread: MY_QUERY`,
      },
    }),
  },
};

// Variant 15: Factory Function with Conditional Logic
// Tests: Factory can access original implementation for conditional mocking
export const FactoryConditional = {
  args: {
    testType: 'FactoryConditional',
  },
  mocks: {
    'src/testing-components/api/client': (original: any) => ({
      ...original,
      client: {
        ...original.client,
        query: (args: any) => {
          if (args.query === 'test') {
            return `Conditional mock: MY_QUERY`;
          }
          return original.client.query(args);
        },
      },
    }),
  },
};

// Variant 16: Factory Function with Multiple Exports
// Tests: Factory can override multiple exports at once
export const FactoryMultipleExports = {
  args: {
    testType: 'FactoryMultipleExports',
  },
  mocks: {
    'src/testing-components/api/client': (original: any) => ({
      ...original,
      QUERY_CONSTANT: 'OVERRIDDEN_CONSTANT',
      client: {
        ...original.client,
        query: () => 'Multiple exports mocked',
      },
    }),
  },
};

type Story = StoryObj<typeof SimpleMockTest>;

// Variant 17: Type Assertion - "as any"
export const WithAsAny = {
  args: {
    testType: 'TypeAssertion',
    expectedResult: 'Mocked with "as any"',
  },
  mocks: {
    'src/testing-components/utils/localUtils': {
      formatCurrency: () => 'Mocked with "as any"',
    },
  },
} as any;

// Variant 18: Type Assertion - "as Story"
export const WithAsStory = {
  args: {
    testType: 'TypeAssertion',
    expectedResult: 'Mocked with "as Story"',
  },
  mocks: {
    'src/testing-components/utils/localUtils': {
      formatCurrency: () => 'Mocked with "as Story"',
    },
  },
} as Story;

// Variant 19: Type Assertion - Nested assertion
export const WithNestedAssertion = {
  args: {
    testType: 'TypeAssertion',
    expectedResult: 'Mocked with nested assertion',
  },
  mocks: {
    'src/testing-components/utils/localUtils': {
      formatCurrency: () => 'Mocked with nested assertion',
    },
  },
} as unknown as Story;

// Variant 20: Type Assertion - "satisfies"
export const WithSatisfies = {
  args: {
    testType: 'TypeAssertion',
    expectedResult: 'Mocked with "satisfies"',
  },
  mocks: {
    'src/testing-components/utils/localUtils': {
      formatCurrency: () => 'Mocked with "satisfies"',
    },
  },
} satisfies Story;
