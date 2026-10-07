// SPIKE (launch-time-entry): the app's own UI, with no Storybook in it - Storybook 10.4+'s new
// setup, where .rnstorybook/index registers its own root.
import { Text, View } from 'react-native';
import { spikeToggleOnce } from './spikeToggle';

console.log('SPIKE_MARKER_APP_EVALUATED');
spikeToggleOnce('app');

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text testID="spike-app-text">SPIKE_APP_SCREEN</Text>
    </View>
  );
}
