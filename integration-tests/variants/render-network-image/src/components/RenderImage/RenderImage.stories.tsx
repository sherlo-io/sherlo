import React from 'react';
import { View, Image, Text } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react';

function RemoteImageComponent(): React.ReactElement {
  console.log('STORY_RENDERED:renderimage--remote');
  return (
    <View style={{ padding: 20 }}>
      <Image
        source={{ uri: 'https://placehold.co/200x200/png' }}
        style={{ width: 200, height: 200 }}
      />
    </View>
  );
}

function PlaceholderComponent(): React.ReactElement {
  console.log('STORY_RENDERED:renderimage--placeholder');
  return (
    <View style={{ padding: 20 }}>
      <Text>placeholder (forces multi-export shape so SDK prepares stories)</Text>
    </View>
  );
}

const meta: Meta<typeof RemoteImageComponent> = { title: 'RenderImage', component: RemoteImageComponent };
export default meta;
type Story = StoryObj<typeof meta>;
export const Remote: Story = {};
export const Placeholder: Story = { render: () => <PlaceholderComponent /> };
