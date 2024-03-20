import { DeviceLocale, DeviceTheme } from '@sherlo/api-types';
import { PartialDeep } from 'type-fest';

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

export type InvalidatedConfig = PartialDeep<Config, { recurseIntoArrays: true }>;
