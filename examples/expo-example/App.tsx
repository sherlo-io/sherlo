import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Button, StatusBar as RNStatusBar } from 'react-native';
import {
  useFonts,
  Urbanist_400Regular,
  Urbanist_500Medium,
  Urbanist_600SemiBold,
  Urbanist_700Bold,
} from '@expo-google-fonts/urbanist';
import * as SplashScreen from 'expo-splash-screen';
import { openStorybook } from '@sherlo/react-native-storybook';
import { StatusBar } from 'expo-status-bar';

// @ts-ignore
const isStandaloneStorybookBuild = process.env.EXPO_PUBLIC_STORYBOOK_ONLY === 'true';
// @ts-ignore
const isDevelopmentBuild = process.env.PROD_BUILD === 'false';

console.log('isStandaloneStorybookBuild', isStandaloneStorybookBuild);
console.log('isDevelopmentBuild', isDevelopmentBuild);

// if (!isStandaloneStorybookBuild && isDevelopmentBuild) {
const registerStorybook = require('@sherlo/react-native-storybook').registerStorybook;
const Storybook = require('./.storybook').default;

registerStorybook(() => <Storybook />);
// }

SplashScreen.preventAutoHideAsync();

// global.SHERLO_VERIFY_SETUP = true;
// global.SHERLO_TEST_CONFIG = {};

export default function App() {
  let [fontsLoaded, fontError] = useFonts({
    Urbanist_400Regular,
    Urbanist_500Medium,
    Urbanist_600SemiBold,
    Urbanist_700Bold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  const [counter, setCounter] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCounter((c) => c + 1);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  console.log('counter', counter);

  // eslint-disable-next-line react/no-unstable-nested-components
  const App = () => {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <StatusBar backgroundColor="red" />
        <RNStatusBar backgroundColor="red" />
        <Text style={{ textAlign: 'center' }}>
          {'Open Dev Menu and select "Toggle Storybook" \nor click the button below'}
          {counter}
        </Text>
        <Button title="Open Storybook" onPress={openStorybook} />
      </View>
    );
  };

  let EntryPoint = App;
  if (isStandaloneStorybookBuild) {
    const Storybook = require('./.storybook').default;

    EntryPoint = Storybook;
  }

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayoutRootView}>
      <EntryPoint />
    </View>
  );
}
