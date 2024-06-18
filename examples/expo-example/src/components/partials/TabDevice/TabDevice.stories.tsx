import type { Meta } from '@storybook/react';
import { TabDevice } from './TabDevice';

export default {
  component: TabDevice,
  args: [],
} as Meta<typeof TabDevice>;

export const Basic = {
  args: {
    deviceName: 'Heating',
  },
};
