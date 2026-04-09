export interface SherloOptions {
  /**
   * Path to the .rnstorybook directory.
   * Absolute path, or relative to the project root.
   * Defaults to `.rnstorybook`.
   */
  storybookPath?: string;
}

/**
 * Wraps a Metro config to automatically integrate Sherlo into your React Native app.
 *
 * Auto-generates `.rnstorybook/index.ts` that imports `getStorybook` and
 * calls `addStorybookToDevMenu()`. The user's App.tsx still controls
 * rendering via `isStorybookMode`.
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
export declare function withSherlo(
  config: Record<string, any>,
  options?: SherloOptions
): Record<string, any>;

export default withSherlo;
