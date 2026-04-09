/**
 * Wraps a Metro config to automatically integrate Sherlo into your React Native app.
 *
 * Intercepts imports of `@storybook/react-native` at the Metro resolver level and
 * redirects them to a generated wrapper that patches `start()` to route
 * `view.getStorybookUI` through `getStorybook(view, params)` and call
 * `addStorybookToDevMenu()`.
 *
 * @example
 * // metro.config.js
 * const { getDefaultConfig } = require('@react-native/metro-config');
 * const { withStorybook } = require('@storybook/react-native/metro/withStorybook');
 * const { withSherlo } = require('@sherlo/react-native-storybook/metro');
 *
 * const config = getDefaultConfig(__dirname);
 * module.exports = withSherlo(withStorybook(config));
 */
export declare function withSherlo(config: Record<string, any>): Record<string, any>;

export default withSherlo;
