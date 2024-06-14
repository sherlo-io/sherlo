import type { Meta, StoryObj } from '@storybook/react';
import TabComponent from './TabComponent';
import StoryDecorator from 'decorators/StoryDecorator';

const meta: Meta<typeof TabComponent> = {
  component: TabComponent,
  decorators: [StoryDecorator()],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    activePage: 0,
    setActivePage: (index) => console.log('setActivePage', index),
  },
};
