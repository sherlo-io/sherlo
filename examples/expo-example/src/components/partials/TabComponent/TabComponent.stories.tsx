import type { Meta, StoryObj } from '@storybook/react';
import TabComponent from './TabComponent';

const meta = {
  component: TabComponent,
} satisfies Meta<typeof TabComponent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    activePage: 0,
    setActivePage: (index) => console.log('setActivePage', index),
  },
};
