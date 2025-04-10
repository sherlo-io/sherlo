import React from 'react';
import {
  isStorybookMode,
  addStorybookToDevMenu,
} from '@sherlo/react-native-storybook';
import Storybook from './.storybook';
import HomeScreen from './src/HomeScreen';
import {StatusBar, useColorScheme} from 'react-native';

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
  const colorScheme = useColorScheme();

  return (
    <>
      <StatusBar
        backgroundColor="transparent"
        translucent
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
      />

      {children}
    </>
  );
}
