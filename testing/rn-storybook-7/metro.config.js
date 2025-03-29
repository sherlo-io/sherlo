const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};
const defaultConfig = mergeConfig(getDefaultConfig(__dirname), config);

module.exports = withStorybook(defaultConfig);
