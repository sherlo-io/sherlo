const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const applySherloTransforms = require('../../packages/react-native-storybook/metro/applySherloTransforms');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, '../../packages/react-native-storybook/metro')];
config.resolver.useWatchman = false;
module.exports = applySherloTransforms(config, { enabled: true });
