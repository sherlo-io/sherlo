const { getDefaultConfig } = require('expo/metro-config');
const withStorybook = require('@sherlo/react-native-storybook/withStorybook');

const config = getDefaultConfig(__dirname);

module.exports = withStorybook(config);
