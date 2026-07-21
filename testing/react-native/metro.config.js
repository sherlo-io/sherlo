const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');

const resolvePath = relativePath => path.resolve(__dirname, relativePath);

const linkedModules = {
  '@sherlo/react-native-storybook': resolvePath('../../packages/react-native-storybook/src'),
};

const extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => {
      return linkedModules[name] || path.join(__dirname, 'node_modules', name);
    },
  },
);

const defaultConfig = getDefaultConfig(__dirname);

const customConfig = mergeConfig(defaultConfig, {
  transformer: {
    unstable_allowRequireContext: true,
  },
  resolver: {
    extraNodeModules,
    // Some deps (e.g. @tamagui/config/v4) ship only .mjs/.cjs entrypoints and
    // declare no matching package `exports` subpath, so Metro must fall back to
    // filesystem resolution - which only works if these extensions are known.
    // @react-native/metro-config omits both; @expo/metro-config includes them.
    sourceExts: [...defaultConfig.resolver.sourceExts, 'mjs', 'cjs'],
  },
  watchFolders: Object.values(linkedModules),
});

module.exports = withStorybook(customConfig, {
  enabled: true,
  // Opt in to the experimental module-mocking pipeline so parameters.sherlo.mocks
  // takes effect here (this app is a device-validation harness for the mocking matrix).
  experimentalMocks: true,
  configPath: path.resolve(__dirname, './.storybook'),
});
