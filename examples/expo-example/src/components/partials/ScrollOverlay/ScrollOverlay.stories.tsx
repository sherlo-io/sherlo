import type { Meta, StoryObj } from '@storybook/react';
import ScrollOverlay from './ScrollOverlay';

const meta = {
  component: ScrollOverlay,
  parameters: {
    backgrounds: {
      default: 'white',
    },
  },
} satisfies Meta<typeof ScrollOverlay>;

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
