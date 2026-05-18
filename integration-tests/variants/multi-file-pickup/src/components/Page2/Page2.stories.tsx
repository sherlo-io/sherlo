import React from 'react';
import { View, Text } from 'react-native';
import type { StoryObj } from '@storybook/react';

function Page2Component(): React.ReactElement {
  return <View style={{ padding: 20 }}><Text>Page2</Text></View>;
}

const meta = { title: 'Page2', component: Page2Component };
export default meta;

export const Default: StoryObj = {};
