export interface WithStorybookOptions {
  /**
   * Whether Storybook is enabled for this build. When `false`, Sherlo installs the
   * storybook-disabled polyfill instead of the full one. Unrelated to mocking.
   */
  enabled?: boolean;

  /** Path to the Storybook config directory (e.g. `./.storybook`). */
  configPath?: string;

  /**
   * Extra module keys to make mockable that the story scan cannot see - a module whose
   * name a story composes while the app runs, rather than naming it with an import
   * expression the scan can read.
   */
  mockModules?: string[];

  [key: string]: unknown;
}

declare function withStorybook(config: any, options?: WithStorybookOptions): any;
export default withStorybook;
export { withStorybook };
