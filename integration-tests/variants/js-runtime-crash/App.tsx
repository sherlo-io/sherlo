import React from 'react';
import { StatusBar } from 'react-native';
import { isStorybookMode } from '@sherlo/react-native-storybook';
import Storybook from './.rnstorybook';

function CrashComponent(): React.ReactElement {
  throw new Error('Intentional JS runtime crash during render');
}

function App(): React.ReactElement {
  if (isStorybookMode) {
    return (
      <>
        <StatusBar translucent />
        <CrashComponent />
        <Storybook />
      </>
    );
  }
  return <StatusBar translucent />;
}

export default App;
