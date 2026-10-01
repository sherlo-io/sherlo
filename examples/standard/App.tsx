/**
 * App entry point
 *
 * Sherlo requires Storybook access to run visual tests
 *
 * Want to switch between Storybook and your app?
 * Learn how: https://sherlo.io/docs/setup?storybook=integrated#storybook-access
 */

import '@sherlo/react-native-storybook';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Storybook from './.rnstorybook';

export default function App() {
  return (
    <View style={styles.fill}>
      <Storybook />
      <SealedCoreBanner />
    </View>
  );
}

// Spike swap-the-core: shows which sealed core this launch is running, so a screenshot proves it.
function SealedCoreBanner() {
  const summary: string =
    (globalThis as any).__SHERLO_CORE_SUMMARY__ ?? '[sherlo-core] no summary - the SDK did not load a core';
  return (
    <View pointerEvents="none" style={styles.banner}>
      <Text style={styles.text}>{summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 48,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(20, 24, 40, 0.92)',
  },
  text: {
    color: '#ffd27a',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
