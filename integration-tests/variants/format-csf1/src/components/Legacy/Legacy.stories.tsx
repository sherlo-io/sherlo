import React from 'react';
import { View, Text } from 'react-native';
function LegacyComponent({ label }: { label: string }): React.ReactElement {
  return <View style={{ padding: 20 }}><Text>{label}</Text></View>;
}
export default {
  title: 'Legacy',
  component: LegacyComponent,
};
export const Alpha = (): React.ReactElement => <LegacyComponent label='Alpha' />;
export const Beta = (): React.ReactElement => <LegacyComponent label='Beta' />;
