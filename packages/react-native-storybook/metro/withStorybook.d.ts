export interface WithStorybookOptions {
  /**
   * Whether Storybook is enabled for this build. When `false`, Sherlo installs the
   * storybook-disabled polyfill instead of the full one. Unrelated to mocking.
   */
  enabled?: boolean;

  /** Path to the Storybook config directory (e.g. `./.storybook`). */
  configPath?: string;

  /**
   * Opt in to the experimental module-mocking pipeline (SHERLO-1764). Default `false`.
   *
   * When `false` (the default) no story mock scan runs, no shims are emitted, no
   * resolver redirect is installed, and the `./mocking` runtime never reaches the
   * bundle - so a normal App Store / Play Store release ships zero mocking artifacts.
   * Set to `true` only in Storybook/testing build lanes where `parameters.sherlo.mocks`
   * should take effect.
   */
  experimentalMocks?: boolean;

  /**
   * Extra mock keys the static story scan cannot see (keys composed at runtime).
   * Only has an effect when `experimentalMocks` is `true`.
   */
  mockModules?: string[];

  [key: string]: unknown;
}

declare function withStorybook(config: any, options?: WithStorybookOptions): any;
export default withStorybook;
export { withStorybook };
