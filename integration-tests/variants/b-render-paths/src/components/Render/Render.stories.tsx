import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import type { Meta, StoryObj } from '@storybook/react';
function StaticComponent(): React.ReactElement {
  console.log('STORY_RENDERED:render--static');
  return <View style={{ padding: 20 }}><Text>B1 Static</Text></View>;
}
function ThrowComponent(): React.ReactElement {
  console.log('STORY_RENDERED:render--throw-on-render');
  throw new Error('B4 intentional render-time throw');
}
function UseEffectThrowComponent(): React.ReactElement {
  useEffect(() => {
    throw new Error('B5 intentional useEffect throw');
  }, []);
  console.log('STORY_RENDERED:render--throw-in-effect');
  return <View style={{ padding: 20 }}><Text>B5 (about to throw)</Text></View>;
}
function StatefulComponent(): React.ReactElement {
  console.log('STORY_RENDERED:render--stateful');
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    setCount(1);
  }, []);
  return <View style={{ padding: 20 }}><Text>B2 count={count}</Text></View>;
}
function AsyncSettleComponent(): React.ReactElement {
  console.log('STORY_RENDERED:render--async-settle');
  const [data, setData] = React.useState<string | null>(null);
  React.useEffect(() => {
    const t = setTimeout(() => setData('settled'), 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ padding: 20 }}>
      {data === null
        ? <ActivityIndicator size="small" />
        : <Text>B3 async: {data}</Text>}
    </View>
  );
}
function ThrowingDecoratorWrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  React.useEffect(() => {
    throw new Error('B-dec-effect: decorator effect throw');
  }, []);
  return <>{children}</>;
}

const meta: Meta<typeof StaticComponent> = { title: 'Render', component: StaticComponent };
export default meta;
type Story = StoryObj<typeof meta>;
export const Static: Story = {};
export const ThrowOnRender: Story = { render: () => <ThrowComponent /> };
export const ThrowInEffect: Story = { render: () => <UseEffectThrowComponent /> };
export const Stateful: Story = { render: () => <StatefulComponent /> };
export const AsyncSettle: Story = { render: () => <AsyncSettleComponent /> };

export const DecoratorRenderThrow: Story = {
  decorators: [
    () => { throw new Error('B-dec-render: decorator render throw'); }
  ],
  render: () => {
    console.log('STORY_RENDERED:render--decorator-render-throw');
    return <View style={{ padding: 20 }}><Text>should not be visible</Text></View>;
  },
};

export const DecoratorEffectThrow: Story = {
  decorators: [
    (Story: any) => (
      <ThrowingDecoratorWrapper>
        <Story />
      </ThrowingDecoratorWrapper>
    ),
  ],
  render: () => {
    console.log('STORY_RENDERED:render--decorator-effect-throw');
    return <View style={{ padding: 20 }}><Text>renders briefly then crashes</Text></View>;
  },
};
