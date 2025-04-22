module.exports = () => {
  const plugins = ['expo-localization'];

  if (process.env.USE_NEW_ARCH === 'true') {
    plugins.push('./plugin.js');
  }

  return {
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
      newArchEnabled: process.env.USE_NEW_ARCH === 'true',
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
      plugins,
      extra: {
        eas: {
          projectId: '4cb166d7-f774-49a9-9aa0-e5533347bcd1',
        },
      },
    },
  };
};
