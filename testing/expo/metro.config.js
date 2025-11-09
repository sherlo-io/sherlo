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
  resolver: {
    ...defaultConfig.resolver,
    extraNodeModules,
  },
  watchFolders: [...(defaultConfig.watchFolders || []), ...Object.values(linkedModules)],
};

// Use new API: extract mocks from all variants in story file dynamically
// Mocks will check getCurrentVariant() at runtime to determine which variant's mocks to use
const configWithSherlo = withSherlo(customConfig, {
  mockFile: resolvePath('src/testing-components/TestInfo/TestInfo.stories.tsx'),
  debug: true,
});

// Apply Storybook wrapper to the extended config
module.exports = withStorybook(configWithSherlo, {
  enabled: true,
  configPath: resolvePath('./.rnstorybook'),
});
