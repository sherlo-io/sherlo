import React from 'react';
import { View, Text } from 'react-native';
import type { StoryObj } from '@storybook/react';

function Page3Component(): React.ReactElement {
  return <View style={{ padding: 20 }}><Text>Page3</Text></View>;
}

const meta = { title: 'Page3', component: Page3Component };
export default meta;

export const Default: StoryObj = {};
