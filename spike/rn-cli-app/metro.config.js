const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const applySherloTransforms = require('../../packages/react-native-storybook/metro/applySherloTransforms');

// The SDK's Metro step on its own (withStorybook needs a full Storybook setup; the bundler
// addresses are all in applySherloTransforms). The SDK's polyfill lives outside this app, so its
// folder is watched.
const config = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [path.resolve(__dirname, '../../packages/react-native-storybook/metro')],
  resolver: { useWatchman: false },
});
module.exports = applySherloTransforms(config, { enabled: true });
