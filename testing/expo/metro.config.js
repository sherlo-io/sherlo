const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');
const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');

const resolvePath = (relativePath) => path.resolve(__dirname, relativePath);

// Linked packages pointing directly to source (not dist!)
const linkedModules = {
  '@sherlo/react-native-storybook': resolvePath('../../packages/react-native-storybook/src'),
};

// Proxy to resolve only linked packages manually, everything else falls back to default node_modules
const extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => {
      return linkedModules[name] || path.join(__dirname, 'node_modules', name);
    },
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

// Apply Storybook wrapper to the extended config
module.exports = withStorybook(customConfig, {
  enabled: true,
  // Opt in to the experimental module-mocking pipeline so parameters.sherlo.mocks
  // takes effect here (this app is a device-validation harness for the mocking matrix).
  experimentalMocks: true,
  configPath: path.resolve(__dirname, './.rnstorybook'),
});
