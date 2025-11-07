// metro.config.js
const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');
const withSherlo = require('./withSherlo');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

const DEBUG = true;
const log = (...args) => DEBUG && console.log('[SHERLO:resolver]', ...args);

const resolvePath = (p) => path.resolve(__dirname, p);

const linkedModules = {
  '@sherlo/react-native-storybook': resolvePath('../../packages/react-native-storybook/src'),
  '@sherlo/testing-components': resolvePath('../testing-components/src'),
};

const extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => linkedModules[name] || path.join(__dirname, 'node_modules', name),
  }
);

const defaultConfig = getDefaultConfig(__dirname);

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

module.exports = withStorybook(configWithSherlo, {
  enabled: true,
  configPath: resolvePath('./.rnstorybook'),
});
