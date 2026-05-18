import React from 'react';
import { View, Text } from 'react-native';
import type { StoryObj } from '@storybook/react';

function Page1Component(): React.ReactElement {
  return <View style={{ padding: 20 }}><Text>Page1</Text></View>;
}

const meta = { title: 'Page1', component: Page1Component };
export default meta;

export const Default: StoryObj = {};
