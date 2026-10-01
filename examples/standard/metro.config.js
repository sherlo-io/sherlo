/**
 * Sherlo Metro wrapper
 *
 * Wrap your Metro config with `withStorybook` from Sherlo.
 * It pulls in `@storybook/react-native` automatically and
 * adds Sherlo's instrumentation to control viewing Storybook during cloud testing
 * and allow user to toggle Storybook via the Dev Menu
 *
 * Learn more: https://sherlo.io/docs/setup#metro-config
 */
const { getDefaultConfig } = require('expo/metro-config');
const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');

const config = getDefaultConfig(__dirname);
// Spike swap-the-core: this checkout sits under brain's .worktrees, which brain's own watchman
// config ignores, so Metro would see no files at all. Crawl the folder directly instead.
config.resolver.useWatchman = false;

module.exports = withStorybook(config);
