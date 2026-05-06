import React from 'react';
import { isStorybookMode } from '@sherlo/react-native-storybook';
import { StatusBar } from 'expo-status-bar';
import Storybook from './.rnstorybook';
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

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StatusBar translucent />

      {children}
    </>
  );
}
