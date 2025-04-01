const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

const resolvePath = relativePath => path.resolve(__dirname, relativePath);

// Tell Metro to *forcefully* resolve and watch source versions of shared packages
const linkedModules = {
  '@sherlo/react-native-storybook': resolvePath(
    '../../packages/react-native-storybook/src',
  ),
  '@sherlo/testing-components': resolvePath('../testing-components'),
};

// Tell Metro to resolve these package names to their real source paths
const extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => {
      return linkedModules[name] || path.join(__dirname, 'node_modules', name);
    },
  },
);

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  resolver: {
    extraNodeModules,
  },
  watchFolders: Object.values(linkedModules),
};

const defaultConfig = mergeConfig(getDefaultConfig(__dirname), config);

module.exports = withStorybook(defaultConfig);
