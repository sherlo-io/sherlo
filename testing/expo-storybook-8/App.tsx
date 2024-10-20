import { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  useFonts,
  Urbanist_400Regular,
  Urbanist_500Medium,
  Urbanist_600SemiBold,
  Urbanist_700Bold,
} from '@expo-google-fonts/urbanist';
import * as SplashScreen from 'expo-splash-screen';
import AppRoot from './src/AppRoot';

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

  if (process.env.PROD_BUILD !== 'true') {
    const { isRunningStorybook } = require('@sherlo/react-native-storybook');
    const Storybook = require('./.storybook').default;
    // @ts-ignore
    if (process.env.EXPO_PUBLIC_STORYBOOK_ONLY || isRunningStorybook) {
      EntryPoint = Storybook;
    }
  }

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayoutRootView}>
      <EntryPoint />
    </View>
  );
}
