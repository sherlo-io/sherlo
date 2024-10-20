const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// config.transformer.unstable_allowRequireContext = true;

// config.resolver.sourceExts.push('mjs');

module.exports = withStorybook(config, {
  // set to false to disable storybook specific settings
  // you can use a env variable to toggle this
  enabled: true,
  // path to your storybook config folder
  configPath: path.resolve(__dirname, './.storybook'),
});
