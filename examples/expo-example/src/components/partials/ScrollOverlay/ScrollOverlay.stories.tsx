import type { Meta, StoryObj } from '@storybook/react';
import ScrollOverlay from './ScrollOverlay';

const meta: Meta<typeof ScrollOverlay> = {
  component: ScrollOverlay,
  parameters: {
    backgrounds: {
      default: 'white',
    },
  },
};

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
