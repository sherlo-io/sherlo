module.exports = () => ({
  expo: {
    owner: 'sherlo',
    name: 'Sherlo Expo Example',
    slug: 'sherlo-expo-example',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    splash: {
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    updates: {
      enabled: true,
      fallbackToCacheTimeout: 300000,
      url: 'https://u.expo.dev/4cb166d7-f774-49a9-9aa0-e5533347bcd1',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.sherlo.example',
      usesNonExemptEncryption: false,
    },
    android: {
      package: 'com.sherlo.example',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    plugins: ['expo-localization'],
    extra: {
      eas: {
        projectId: '4cb166d7-f774-49a9-9aa0-e5533347bcd1',
      },
    },
  },
});
