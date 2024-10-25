import type { Meta, StoryObj } from '@storybook/react';
import RoomsListItem from './RoomsListItem';
import StoryDecorator from '../../../../decorators/StoryDecorator';
import { Dimensions, StyleSheet, View } from 'react-native';

const RoomsListItemDecorator = (Story: React.FC) => (
  <View style={styles.container}>
    <Story />
  </View>
);

const meta: Meta<typeof RoomsListItem> = {
  component: RoomsListItem,
  decorators: [RoomsListItemDecorator, StoryDecorator({ placement: 'center' })],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Livingroom: Story = {
  args: {
    id: 'living-room',
    activeDevicesCount: 7,
  },
};

export const Bedroom: Story = {
  args: {
    id: 'bedroom',
    activeDevicesCount: 4,
  },
};

export const Office: Story = {
  args: {
    id: 'office',
    activeDevicesCount: 4,
  },
};

export const Bathroom: Story = {
  args: {
    id: 'bathroom',
    activeDevicesCount: 3,
  },
};

const styles = StyleSheet.create({
  container: {
    width: Dimensions.get('screen').width,
  },
});
