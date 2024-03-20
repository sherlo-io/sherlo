import type { Meta, StoryObj } from '@storybook/react';
import ListGradient from './ListGradient';

const meta = {
  component: ListGradient,
  parameters: {
    backgrounds: {
      default: 'white',
    },
  },
} satisfies Meta<typeof ListGradient>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Top: Story = {
  args: {
    position: 'top',
    visible: true,
  },
};
export const Bottom: Story = {
  args: {
    position: 'bottom',
    visible: true,
  },
};
