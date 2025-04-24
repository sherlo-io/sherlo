const fs = require('fs');

module.exports = () => {
  const plugins = ['expo-localization'];

  if (process.env.USE_NEW_ARCH === 'true') {
    // We copy the plugin to the root of the project to avoid issues related to linking
    // @sherlo/react-native-storybook during development.
    // End users won't experience this issue.
    fs.copyFileSync('../../packages/react-native-storybook/app.plugin.js', 'tmp_plugin.js');
    plugins.push('./tmp_plugin.js');
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
        config: {
          usesNonExemptEncryption: false,
        },
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
