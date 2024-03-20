import type { Meta } from '@storybook/react';
import Header from './Header';

export default {
  component: Header,
} as Meta<typeof Header>;

export const Tabs = {
  args: {
    avatarSource: require('../../../../assets/Images/GabeTheDog.jpeg'),
    title: 'Heating',
    onBackPress: () => console.log('Pressed'),
  },
};

export const Settings = {
  args: {
    avatarSource: require('../../../../assets/Images/GabeTheDog.jpeg'),
    userName: 'Jakupik',
  },
};
