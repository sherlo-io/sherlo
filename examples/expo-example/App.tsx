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
import { openStorybook, verifyIntegration } from '@sherlo/react-native-storybook';

SplashScreen.preventAutoHideAsync();

verifyIntegration();

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
    // @ts-ignore
    if (process.env.PROD_BUILD !== 'true') {
      const { isRunningStorybook } = require('@sherlo/react-native-storybook');
      const Storybook = require('./.storybook').default;
      // @ts-ignore
      if (process.env.EXPO_PUBLIC_STORYBOOK_ONLY || isRunningStorybook) {
        return <Storybook />;
      }
    }

    return (
      <View
        style={{
          flex: 1,
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

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayoutRootView}>
      <App />
    </View>
  );
}
