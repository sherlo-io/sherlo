/**
 * Sherlo Metro wrapper
 *
 * Wraps Metro to integrate Storybook so it can be toggled via the Dev Menu
 * and controlled by Sherlo during cloud testing.
 *
 * Learn more: https://sherlo.io/docs/setup#metro-config
 */

const { getDefaultConfig } = require('expo/metro-config');
const withStorybook = require('@sherlo/react-native-storybook/withStorybook');

const config = getDefaultConfig(__dirname);

module.exports = withStorybook(config);
