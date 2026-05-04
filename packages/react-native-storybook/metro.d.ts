/**
 * Factory that creates a Sherlo-enhanced Metro config wrapper with the same signature
 * as the provided withStorybook function.
 *
 * @example
 * // metro.config.js
 * const { getDefaultConfig } = require('@react-native/metro-config');
 * const { withStorybook } = require('@storybook/react-native/metro/withStorybook');
 * const { createSherloStorybook } = require('@sherlo/react-native-storybook/metro');
 *
 * const withSherloStorybook = createSherloStorybook(withStorybook);
 *
 * const defaultConfig = getDefaultConfig(__dirname);
 * module.exports = withSherloStorybook(defaultConfig, { enabled: true, configPath: __dirname + '/.rnstorybook' });
 */
export declare function createSherloStorybook<W extends (config: any, opts?: any) => any>(
  withStorybook: W
): W;

export default createSherloStorybook;
