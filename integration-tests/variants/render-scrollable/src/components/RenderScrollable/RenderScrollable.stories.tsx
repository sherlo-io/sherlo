import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react';

function TallScrollComponent(): React.ReactElement {
  console.log('STORY_RENDERED:render-scrollable--tall');
  // 30 rows of 100dp each - guaranteed to exceed viewport on any test device.
  return (
    <ScrollView style={{ flex: 1 }}>
      {Array.from({ length: 30 }).map((_, i) => (
        <View key={i} style={{ height: 100, padding: 20, backgroundColor: i % 2 === 0 ? '#eee' : '#fff' }}>
          <Text>Row {i + 1}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const meta: Meta<typeof TallScrollComponent> = { title: 'Render Scrollable', component: TallScrollComponent };
export default meta;
type Story = StoryObj<typeof meta>;
export const Tall: Story = {};
