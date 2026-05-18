import React from 'react';
import { View, Text, TextInput } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react';
function MixedComponent(): React.ReactElement {
  return <View style={{ padding: 20 }}><Text>Mixed</Text></View>;
}
const meta: Meta<typeof MixedComponent> = { title: 'Mixed', component: MixedComponent };
export default meta;
type Story = StoryObj<typeof meta>;
export const Card: Story = {};
export const Form: Story = {
  render: () => (
    <View style={{ padding: 20 }}>
      <Text>Form</Text>
      <TextInput style={{ borderWidth: 1, padding: 4 }} />
    </View>
  ),
};
export const Nested: Story = {
  render: () => (
    <View style={{ padding: 20 }}>
      <View><Text>Nested</Text></View>
    </View>
  ),
};
