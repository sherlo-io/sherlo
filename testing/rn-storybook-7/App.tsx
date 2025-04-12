import React from 'react';
import {
  isStorybookMode,
  addStorybookToDevMenu,
} from '@sherlo/react-native-storybook';
import Storybook from './.storybook';
import HomeScreen from './src/HomeScreen';
import {StatusBar, Appearance} from 'react-native';

addStorybookToDevMenu();

StatusBar.setTranslucent(true);
StatusBar.setBackgroundColor('transparent');
StatusBar.setBarStyle(
  Appearance?.getColorScheme() === 'dark' ? 'light-content' : 'dark-content',
);

function App() {
  if (isStorybookMode) {
    return <Storybook />;
  }

  return <HomeScreen />;
}

export default App;
