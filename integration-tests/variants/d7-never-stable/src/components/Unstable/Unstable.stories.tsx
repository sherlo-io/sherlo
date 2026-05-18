import React from 'react';
import { View, Text } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react';
function UnstableComponent(): React.ReactElement {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, []);
  return <View style={{ padding: 20 }}><Text>tick: {tick}</Text></View>;
}
const meta: Meta<typeof UnstableComponent> = { title: 'Unstable', component: UnstableComponent };
export default meta;
type Story = StoryObj<typeof meta>;
export const Always: Story = {};
