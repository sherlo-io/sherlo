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

  /**
   * Opt in to the experimental module manifest sidecar (SHERLO-1890, Diff Scope v2
   * Phase A spike). Default `false`.
   *
   * When `false` (the default) no manifest is emitted and none of the manifest
   * code runs; the bundle and the existing graph.json sidecar are byte-for-byte
   * unchanged. When `true`, a second sidecar (module-manifest.json) is written
   * alongside graph.json recording per-module content hashes keyed by source path
   * and each story's transitive dependency closure. The manifest is INERT - nothing
   * consumes it yet.
   */
  experimentalModuleManifest?: boolean;

  [key: string]: unknown;
}

declare function withStorybook(config: any, options?: WithStorybookOptions): any;
export default withStorybook;
export { withStorybook };
