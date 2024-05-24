import type { Meta, StoryObj } from '@storybook/react';
import TabBar from './TabBar';
import StoryDecorator from 'decorators/StoryDecorator';

const meta: Meta<typeof TabBar> = {
  component: TabBar,
  decorators: [StoryDecorator()],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    goToPage: () => console.log('clicked'),
    activePage: 0,
  },
};
