import type { Meta } from '@storybook/react';
import { StoryDecorator, DefaultExportTest } from '@sherlo/testing-components';

export default {
  component: DefaultExportTest,
  decorators: [StoryDecorator({ placement: 'center' })],
} as Meta<typeof DefaultExportTest>;

export const MockedDefault = {
  mocks: {
    '../utils/testHelper': {
      default: {
        getValue: () => 'mocked-value-1',
        getNumber: () => 100,
        getObject: () => ({ key: 'mocked-1' }),
      },
    },
  },
};

export const AnotherMockedDefault = {
  mocks: {
    '../utils/testHelper': {
      default: {
        getValue: () => 'mocked-value-2',
        getNumber: () => 200,
        getObject: () => ({ key: 'mocked-2' }),
      },
    },
  },
};

