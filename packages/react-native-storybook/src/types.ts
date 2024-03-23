import { constants } from './data';
import type { ReactRenderer } from '@storybook/react';
import type { PreparedStory } from '@storybook/types';
import { DeviceLocale, DeviceTheme } from '@sherlo/api-types';
import { start } from '@storybook/react-native';

export type Story = {
  displayName: string;
  id: string;
  mode: typeof constants.modes.DEFAULT_MODE | typeof constants.modes.FULL_HEIGHT_MODE;
  storyId: string;
} & PreparedStory<ReactRenderer>;

export type StorybookView = ReturnType<typeof start>;

type StorybookParamsRaw = Parameters<StorybookView['getStorybookUI']>[0];
export type StorybookParams = StorybookParamsRaw extends infer U
  ? U extends undefined
    ? never
    : U
  : never;

export interface Config {
  projectToken: string;
  android?: {
    devices: {
      id: string;
      locale: DeviceLocale;
      osVersion: string;
      theme: DeviceTheme;
    }[];
    packageName: string;
    path: string;
    activity?: string;
  };
  exclude?: string[];
  include?: string[];
  ios?: {
    bundleIdentifier: string;
    devices: {
      id: string;
      locale: DeviceLocale;
      osVersion: string;
      theme: DeviceTheme;
    }[];
    path: string;
  };
}
