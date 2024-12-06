import { start } from '@storybook/react-native';
export interface SherloParameters {
  /**
   * Setting exclude to true skips the story during testing. This might be
   * useful if the story has animations that cannot be stabilized for testing
   * or the component behaves in less predictable ways.
   */
  exclude?: boolean;

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
}

export type Snapshot = {
  // sherlo exclusive parameters
  viewId: string; // components-avatar--basic-deviceHeight
  mode: SnapshotMode; // deviceHeight
  displayName: string; // components/Avatar - Basic
  sherloParameters?: SherloParameters;

  // storybook parameters
  componentId: string; // components-avatar
  componentTitle: string; // components/Avatar
  storyId: string; // components-avatar--basic
  storyTitle: string; // Basic
  parameters: any;
  argTypes: any;
  args: any;
};

export type SnapshotMode = 'deviceHeight' | 'fullHeight';

export type StorybookView = ReturnType<typeof start>;

type StorybookParamsRaw = Parameters<StorybookView['getStorybookUI']>[0];
export type StorybookParams = StorybookParamsRaw extends infer U
  ? U extends undefined
    ? never
    : U
  : never;

export type StorybookViewMode = 'testing' | 'default' | 'storybook' | 'verification';
