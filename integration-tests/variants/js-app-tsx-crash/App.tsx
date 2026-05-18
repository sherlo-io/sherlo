import React from 'react';
import { StatusBar } from 'react-native';
import { isStorybookMode } from '@sherlo/react-native-storybook';
import Storybook from './.rnstorybook';
import IntentionalCrasher from './intentionalCrasher';

IntentionalCrasher.crash();

function App(): React.ReactElement {
  if (isStorybookMode) {
    return (
      <>
        <StatusBar translucent />
        <Storybook />
      </>
    );
  }
  return <StatusBar translucent />;
}

export default App;
