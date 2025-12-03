// metro.config.js
const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');
const withSherlo = require('@sherlo/react-native-storybook/metro/withSherlo');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

const resolvePath = (relativePath) => path.resolve(__dirname, relativePath);

// Linked packages pointing directly to source (not dist!)
const linkedModules = {
  '@sherlo/react-native-storybook': resolvePath('../../packages/react-native-storybook/src'),
  '@sherlo/testing-components': resolvePath('../testing-components/src'),
};

// Proxy to resolve only linked packages manually, everything else falls back to default node_modules
const extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => linkedModules[name] || path.join(__dirname, 'node_modules', name),
  }
);

// Get the default Expo metro config
const defaultConfig = getDefaultConfig(__dirname);

// Create our custom config that extends the default
const customConfig = {
  ...defaultConfig,
  transformer: {
    ...defaultConfig.transformer,
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    ...defaultConfig.resolver,
    assetExts: defaultConfig.resolver.assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...defaultConfig.resolver.sourceExts, 'svg'],
    extraNodeModules,
  },
  watchFolders: [...(defaultConfig.watchFolders || []), ...Object.values(linkedModules)],
};

// IMPORTANT: withStorybook must run FIRST to generate storybook.requires.ts
// Then withSherlo can read that file to discover story files
const configWithStorybook = withStorybook(customConfig, {
  enabled: true,
  configPath: resolvePath('./.rnstorybook'),
});

module.exports = withSherlo(configWithStorybook, {
  debug: true,
});
