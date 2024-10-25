import type { Meta, StoryObj } from '@storybook/react';
import DevicesList from './DevicesList';
import { DEVICES_DATA } from '../../../fixtures/devices';
import StoryDecorator from 'decorators/StoryDecorator';

const meta: Meta<typeof DevicesList> = {
  component: DevicesList,
  decorators: [StoryDecorator()],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    DATA: DEVICES_DATA,
  },
};
