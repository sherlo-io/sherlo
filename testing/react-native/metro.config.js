const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');

const resolvePath = relativePath => path.resolve(__dirname, relativePath);

// SPIKE scene-cloud-speed: the src link gave the mock shim a second registry in Release; not for landing.
const linkedModules = {};

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
    // SPIKE scene-cloud-speed: on by default from RN 0.79; the SDK's `/mocking` entry needs it.
    unstable_enablePackageExports: true,
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
  configPath: path.resolve(__dirname, './.storybook'),
});
