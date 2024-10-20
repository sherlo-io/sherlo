import { useCallback } from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import {
  useFonts,
  Urbanist_400Regular,
  Urbanist_500Medium,
  Urbanist_600SemiBold,
  Urbanist_700Bold,
} from '@expo-google-fonts/urbanist';
import * as SplashScreen from 'expo-splash-screen';
import AppRoot from 'AppRoot';

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

  if (!fontsLoaded && !fontError) {
    return null;
  }

  let EntryPoint = AppRoot;
  // @ts-ignore
  if (process.env.EXPO_PUBLIC_STORYBOOK_ONLY === 'true') {
    const Storybook = require('./.storybook').default;
    EntryPoint = Storybook;
  }

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayoutRootView}>
      <EntryPoint />
    </View>
  );
}
