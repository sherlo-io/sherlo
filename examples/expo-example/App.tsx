import { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Button, StatusBar as RNStatusBar } from 'react-native';
import {
  useFonts,
  Urbanist_400Regular,
  Urbanist_500Medium,
  Urbanist_600SemiBold,
  Urbanist_700Bold,
} from '@expo-google-fonts/urbanist';
import * as SplashScreen from 'expo-splash-screen';
import { openStorybook, loaded } from '@sherlo/react-native-storybook';
import { StatusBar } from 'expo-status-bar';

// @ts-ignore
if (!process.env.EXPO_PUBLIC_STORYBOOK_ONLY && process.env.PROD_BUILD !== 'true') {
  const registerStorybook = require('@sherlo/react-native-storybook').registerStorybook;
  const Storybook = require('./.storybook').default;
  registerStorybook(() => <Storybook />);
}

SplashScreen.preventAutoHideAsync();

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

  // eslint-disable-next-line react/no-unstable-nested-components
  const App = () => {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: 'red',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <StatusBar backgroundColor="#f00" />
        <RNStatusBar backgroundColor="#f00" />
        <Text style={{ textAlign: 'center' }}>
          {'Open Dev Menu and select "Toggle Storybook" \nor click the button below'}
        </Text>
        <Button title="Open Storybook" onPress={openStorybook} />
      </View>
    );
  };

  let EntryPoint = App;
  // @ts-ignore
  if (process.env.EXPO_PUBLIC_STORYBOOK_ONLY === 'true') {
    const Storybook = require('./.storybook').default;
    EntryPoint = Storybook;
  }

  useEffect(() => {
    loaded();
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayoutRootView}>
      <EntryPoint />
    </View>
  );
}
