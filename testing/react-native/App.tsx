import React from 'react';
import {isStorybookMode} from '@sherlo/react-native-storybook';
import {StatusBar} from 'expo-status-bar';
import {StyleSheet, Text, View} from 'react-native';
import Storybook from './.storybook';
import HomeScreen from './src/HomeScreen';

function App() {
  if (isStorybookMode) {
    return (
      <Wrapper>
        <Storybook />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <HomeScreen />
    </Wrapper>
  );
}

export default App;

/* ========================================================================== */

function Wrapper({children}: {children: React.ReactNode}) {
  return (
    <>
      <StatusBar translucent />

      {children}

      <SealedCoreBanner />
    </>
  );
}

// Spike swap-the-core: shows which sealed core this launch is running, so a screenshot proves it.
function SealedCoreBanner() {
  const summary: string =
    (globalThis as any).__SHERLO_CORE_SUMMARY__ ?? '[sherlo-core] no summary';
  return (
    <View pointerEvents="none" style={bannerStyles.banner}>
      <Text style={bannerStyles.text}>{summary}</Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 40,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(20, 24, 40, 0.92)',
  },
  text: {color: '#ffd27a', fontSize: 13, fontFamily: 'Menlo'},
});
