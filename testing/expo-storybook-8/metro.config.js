const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
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
    get: (_, name) => {
      return linkedModules[name] || path.join(__dirname, 'node_modules', name);
    },
  }
);

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = extraNodeModules;
config.watchFolders = [...(config.watchFolders || []), ...Object.values(linkedModules)];

module.exports = withStorybook(config, {
  enabled: true,
  configPath: path.resolve(__dirname, './.storybook'),
});
