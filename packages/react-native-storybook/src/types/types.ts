import type { View } from '@storybook/react-native';
import type { MockSet } from '../mocking/types';

export interface SherloParameters {
  /**
   * Module Mocking (SHERLO-1734): a map of module specifier -> mock definition,
   * applied for the duration of the story's snapshot. Declaring a key here also
   * registers it for the config-time Metro scan, which emits the shim that makes
   * the module mockable. The key must be a string literal so the static scan can
   * see it. Deny-listed modules (react, react-native, @storybook/*, @sherlo/*)
   * cannot be mocked - mock a wrapper module you own instead.
   */
  mocks?: MockSet;

  /**
   * Setting exclude to true skips the story during testing. This might be
   * useful if the story has animations that cannot be stabilized for testing
   * or the component behaves in less predictable ways.
   */
  exclude?: boolean;

  /**
   * Setting disableScrollCapture to true will force a single viewport snapshot of the story,
   * even if the content is scrollable. By default, Sherlo automatically captures scrollable
   * content as a stitched long screenshot.
   */
  disableScrollCapture?: boolean;

  /**
   * You can supply figmaUrl parameter with an URL to figma frame that contains
   * designs for this specific component. If supplied it can be viewed during
   * review to easily compare the implementation with designs and detect any
   * differences.
   */
  figmaUrl?: string;

  /**
   * Setting platform parameter to either android or ios tests the story only
   * for that specific platform. By default, Sherlo tests all stories on all
   * platforms specified in sherlo.config.json.
   */
  platform?: 'ios' | 'android';

  /**
   * Suppresses the SafeAreaProvider inset applied around a captured story.
   * Read by the private capture loop (reused through the seam) - this type
   * only publishes the vocabulary; the reader stays private.
   */
  noSafeArea?: boolean;

  /**
   * Overrides Storybook's theme for the duration of this story's capture,
   * merged over the default theme. Read privately; typed loosely here since
   * the theming package (@storybook/react-native-theming) is an optional peer.
   */
  theme?: Record<string, unknown>;

  /**
   * Whether this story captures a single viewport ('deviceHeight', the
   * default) or the full scrollable content ('fullHeight'). Read privately -
   * see SnapshotMode.
   */
  mode?: SnapshotMode;
}

export type StoryId = `${string}--${string}`;

export type SnapshotMode = 'deviceHeight' | 'fullHeight';

export type StorybookView = View;

type StorybookParamsRaw = Parameters<StorybookView['getStorybookUI']>[0];
export type StorybookParams = StorybookParamsRaw extends infer U
  ? U extends undefined
    ? never
    : U
  : never;

/**
 * Mode reported by the native SherloModule.
 *
 * - `'default'` - Normal app mode. Storybook is not displayed.
 * - `'storybook'` - User activated Storybook via Dev Menu toggle or `openStorybook()`.
 * - `'testing'` - Sherlo is running automated visual tests on a simulator.
 *
 * Use `isStorybookMode` (true when `'storybook'` or `'testing'`) to decide whether
 * to render Storybook, and `isRunningVisualTests` (true only for `'testing'`) when
 * you need to disable animations or mock data during test runs.
 */
export type StorybookViewMode = 'testing' | 'default' | 'storybook';
