import { start } from '@storybook/react-native';
import { SherloParameters } from '../getSherloParameters';

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

export type StorybookViewMode = 'preview' | 'testing' | 'original' | 'loading';
