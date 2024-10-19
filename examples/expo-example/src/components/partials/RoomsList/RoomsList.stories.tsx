import type { Meta, StoryObj } from '@storybook/react';
import RoomsList from './RoomsList';
import { ROOMS_DATA } from '../../../fixtures/rooms';
import StoryDecorator from 'decorators/StoryDecorator';

const meta: Meta<typeof RoomsList> = {
  component: RoomsList,
  decorators: [StoryDecorator()],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    DATA: ROOMS_DATA,
  },
};
