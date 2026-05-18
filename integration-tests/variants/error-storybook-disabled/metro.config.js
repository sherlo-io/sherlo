const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');
const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');

module.exports = withStorybook(getDefaultConfig(__dirname), {
  enabled: false,
  onDisabledRemoveStorybook: true,
  configPath: path.resolve(__dirname, './.rnstorybook'),
});
