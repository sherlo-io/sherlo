import type { Meta } from '@storybook/react';
import InfoDisplay from './InfoDisplay';

export default {
  component: InfoDisplay,
} as Meta<typeof InfoDisplay>;

type Story = {
  args: {
    variant: string;
  };
};

export const Heating: Story = {
  args: {
    variant: 'Heating',
  },
};

export const AirPurifier: Story = {
  args: {
    variant: 'Air Purifier',
  },
};
