import { useEffect } from 'react';

const hideSplashScreens: (() => void)[] = [];

try {
  const ExpoSplashScreen = require('expo-splash-screen');

  hideSplashScreens.push(() => {
    try {
      ExpoSplashScreen.hide();
    } catch {
      try {
        ExpoSplashScreen.hideAsync();
      } catch {}
    }
  });
} catch {
  // No expo-splash-scree package available
}

try {
  const RNSplashScreen = require('react-native-splash-screen');

  hideSplashScreens.push(() => {
    try {
      RNSplashScreen.hide();
    } catch {}
  });
} catch {
  // No react-native-splash-screen package available
}

try {
  const BootSplash = require('react-native-bootsplash');

  hideSplashScreens.push(() => {
    try {
      BootSplash.hide();
    } catch {}
  });
} catch {
  // No react-native-bootsplash package available
}

export function useHideSplashScreen() {
  useEffect(() => {
    hideSplashScreens.forEach((hide) => hide());
  }, []);
}

export default useHideSplashScreen;
