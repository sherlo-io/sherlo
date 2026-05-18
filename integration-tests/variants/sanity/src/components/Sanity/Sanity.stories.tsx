import React from 'react';
import { Text, View } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react';

function SanityComponent(): React.ReactElement {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>integrated-app-bare-rn</Text>
    </View>
  );
}

const meta: Meta<typeof SanityComponent> = {
  title: 'Sanity',
  component: SanityComponent,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
