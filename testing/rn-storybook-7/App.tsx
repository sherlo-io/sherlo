import React from 'react';
import {
  isStorybookMode,
  addStorybookToDevMenu,
} from '@sherlo/react-native-storybook';
import Storybook from './.storybook';
import HomeScreen from './src/HomeScreen';
import {StatusBar} from 'react-native';

addStorybookToDevMenu();

StatusBar.setTranslucent(true);
StatusBar.setBackgroundColor('transparent');

function App() {
  if (isStorybookMode) {
    return <Storybook />;
  }

  return <HomeScreen />;
}

export default App;
