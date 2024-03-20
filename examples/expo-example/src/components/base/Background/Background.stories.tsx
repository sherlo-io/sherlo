import type { Meta } from '@storybook/react';
import Background from './Background';

export default {
  component: Background,
  args: [],
} as Meta<typeof Background>;

type Story = {
  args: {
    color: string;
  };
};

export const Green: Story = {
  args: {
    color: 'green',
  },
};

export const Blue: Story = {
  args: {
    color: 'blue',
  },
};
