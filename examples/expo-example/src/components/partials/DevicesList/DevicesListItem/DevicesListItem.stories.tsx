import { Dimensions, StyleSheet, View } from 'react-native';
import StoryDecorator from '../../../../decorators/StoryDecorator';
import DevicesListItem from './DevicesListItem';
import type { Meta, StoryObj } from '@storybook/react';

const DevicesListItemDecorator = (Story: React.FC) => (
  <View style={styles.container}>
    <Story />
  </View>
);

const meta: Meta<typeof DevicesListItem> = {
  component: DevicesListItem,
  decorators: [DevicesListItemDecorator, StoryDecorator({ placement: 'center' })],
};

export default meta;

type Story = StoryObj<typeof meta>;

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

const styles = StyleSheet.create({
  container: {
    width: Dimensions.get('screen').width / 2,
  },
});
