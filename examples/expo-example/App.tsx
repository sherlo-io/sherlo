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
import { StatusBar } from 'expo-status-bar';
import { withStorybook, useSherlo } from '@sherlo/react-native-storybook';

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

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // eslint-disable-next-line react/no-unstable-nested-components
  const App = () => {
    const { openStorybook } = useSherlo();

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ textAlign: 'center' }}>
          {'Open Dev Menu and select "Toggle Storybook" \nor click the button below'}
        </Text>
        <Button title="Open Storybook" onPress={openStorybook} />
      </View>
    );
  };

  let EntryPoint;
  if (process.env.EXPO_PUBLIC_STORYBOOK_ONLY === 'true') {
    const Storybook = require('./.storybook').default;
    EntryPoint = Storybook;
  } else {
    const Storybook = require('./.storybook').default;
    EntryPoint = withStorybook(App, Storybook);
  }

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayoutRootView}>
      <StatusBar style="light" />
      <EntryPoint />
    </View>
  );
}
