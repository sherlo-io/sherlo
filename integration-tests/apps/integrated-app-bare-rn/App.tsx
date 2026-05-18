import React from 'react';
import { Button, StatusBar, StyleSheet, Text, View } from 'react-native';
import { isStorybookMode, openStorybook } from '@sherlo/react-native-storybook';
import Storybook from './.rnstorybook';

function App(): React.ReactElement {
  if (isStorybookMode) {
    return (
      <>
        <StatusBar translucent />
        <Storybook />
      </>
    );
  }
  return (
    <>
      <StatusBar translucent />
      <View style={styles.container}>
        <Text style={styles.text}>
          {'Open Dev Menu and select "Toggle Storybook" \nor click the button below'}
        </Text>
        <Button title="Open Storybook" onPress={openStorybook} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
    marginBottom: 12,
  },
});

export default App;
