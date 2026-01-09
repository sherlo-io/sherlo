const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {generate} = require('@storybook/react-native/scripts/generate');

generate({
  // update ./.storybook to your storybook folder
  configPath: path.resolve(__dirname, './.storybook'),
});

const resolvePath = relativePath => path.resolve(__dirname, relativePath);

// Tell Metro to *forcefully* resolve and watch source versions of shared packages
const linkedModules = {
  '@sherlo/react-native-storybook': resolvePath(
    '../../packages/react-native-storybook/src',
  ),
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

const defaultConfig = getDefaultConfig(__dirname);

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  transformer: {
    unstable_allowRequireContext: true,
  },
  resolver: {
    extraNodeModules,
    sourceExts: [...defaultConfig.resolver.sourceExts, 'mjs'],
  },
  watchFolders: Object.values(linkedModules),
};

module.exports = mergeConfig(defaultConfig, config);
