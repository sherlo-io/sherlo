import type { Meta, StoryObj } from '@storybook/react';
import Header from './Header';
import StoryDecorator from 'decorators/StoryDecorator';

const meta: Meta<typeof Header> = {
  component: Header,
  decorators: [StoryDecorator({ placement: 'top' })],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Tabs: Story = {
  args: {
    avatarSource: require('../../../../assets/Images/AvatarImage.png'),
    title: 'Heating',
    onBackPress: () => console.log('Pressed'),
  },
};

export const Settings: Story = {
  args: {
    avatarSource: require('../../../../assets/Images/AvatarImage.png'),
    userName: 'User',
  },
};
