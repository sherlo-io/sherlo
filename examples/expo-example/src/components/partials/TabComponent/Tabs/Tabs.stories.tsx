import type { Meta, StoryObj } from '@storybook/react';

import Tabs from './Tabs';
import StoryDecorator from 'decorators/StoryDecorator';

const meta: Meta<typeof Tabs> = {
  component: Tabs,
  decorators: [StoryDecorator()],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Devices: Story = {
  args: {
    initialPage: 0,
  },
};
export const Rooms: Story = {
  args: {
    initialPage: 1,
  },
};
