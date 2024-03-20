import { Dimensions, StyleSheet, View } from 'react-native';
import StoryDecorator from '../../../../decorators/StoryDecorator';
import DevicesListItem from './DevicesListItem';
import type { Meta } from '@storybook/react';

const DevicesListItemDecorator = (Story: React.FC) => (
  <View style={styles.container}>
    <Story />
  </View>
);

const styles = StyleSheet.create({
  container: {
    width: Dimensions.get('screen').width / 2,
  },
});

export default {
  component: DevicesListItem,
  decorators: [DevicesListItemDecorator, StoryDecorator],
} as Meta<typeof DevicesListItem>;

type Story = {
  args: {
    id: string;
  };
};

export const TopLights: Story = {
  args: {
    id: 'top-lights',
  },
};

export const AirPurifier: Story = {
  args: {
    id: 'air-purifier',
  },
};

export const VacuumCleaner: Story = {
  args: {
    id: 'vacuum-cleaner',
  },
};

export const BedsideLamp: Story = {
  args: {
    id: 'bedside-lamp',
  },
};

export const Speaker: Story = {
  args: {
    id: 'speaker',
  },
};

export const Heating: Story = {
  args: {
    id: 'heating',
  },
};
