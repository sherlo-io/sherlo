import React from 'react';
import { View, Text } from 'react-native';
import type { StoryObj } from '@storybook/react';

function MixedComponent({ label }: { label: string }): React.ReactElement {
  return <View style={{ padding: 20 }}><Text>{label}</Text></View>;
}

export default { title: 'Mixed', component: MixedComponent };

// CSF1: function export
export const Legacy = (): React.ReactElement => <MixedComponent label='Legacy CSF1' />;

// CSF3: empty body, auto-renders meta.component
export const Modern: StoryObj = {};

// CSF3: explicit render function
export const ModernRender: StoryObj = {
  render: () => <MixedComponent label='Modern with render fn' />,
};
