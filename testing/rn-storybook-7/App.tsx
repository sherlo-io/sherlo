import React from 'react';
import {
  isStorybookMode,
  addStorybookToDevMenu,
} from '@sherlo/react-native-storybook';
import {StatusBar} from 'react-native';
import Storybook from './.storybook';
import HomeScreen from './src/HomeScreen';

addStorybookToDevMenu();

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
    </>
  );
}
