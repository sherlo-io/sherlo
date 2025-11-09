import type { Meta } from '@storybook/react';
import { StoryDecorator, LocalImportTest } from '@sherlo/testing-components';

export default {
  component: LocalImportTest,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof LocalImportTest>;

export const MockedLocalUtils = {
  args: {},
  mocks: {
    '../utils/localUtils': {
      formatCurrency: (amount: number, currency: string = 'USD') => `MOCKED ${currency} ${amount.toFixed(2)}`,
      formatDate: (date: Date) => 'MOCKED DATE',
      calculateTotal: (items: number[]) => 999,
      APP_NAME: 'Mocked App',
      VERSION: '2.0.0',
    },
  },
};

export const AnotherMockedLocalUtils = {
  args: {},
  mocks: {
    '../utils/localUtils': {
      formatCurrency: (amount: number, currency: string = 'USD') => `ALTERNATE ${currency} ${amount.toFixed(2)}`,
      formatDate: (date: Date) => 'ALTERNATE DATE',
      calculateTotal: (items: number[]) => 1234,
      APP_NAME: 'Alternate App',
      VERSION: '3.0.0',
    },
  },
};

