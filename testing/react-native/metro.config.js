const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const withStorybook = require('@sherlo/react-native-storybook/withStorybook');

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
    sourceExts: [...defaultConfig.resolver.sourceExts, 'mjs'],
  },
  watchFolders: Object.values(linkedModules),
});

module.exports = withStorybook(customConfig, {
  enabled: true,
  configPath: path.resolve(__dirname, './.storybook'),
});
