import { DeviceLocale, DeviceTheme } from '@sherlo/api-types';
import { PartialDeep } from 'type-fest';

export type Mode = 'sync' | 'asyncInit' | 'asyncUpload';

export type ConfigMode = 'withPaths' | 'withoutPaths';

export interface Paths {
  android: {
    path: string;
  };
  ios: {
    path: string;
  };
}

// Base configuration interface without paths specified
export interface BaseConfig {
  token: string;
  android?: {
    devices: {
      id: string;
      locale: DeviceLocale;
      osVersion: string;
      theme: DeviceTheme;
    }[];
    packageName: string;
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
  };
}

export type Config<M extends ConfigMode> = M extends 'withPaths' ? BaseConfig & Paths : BaseConfig;

export type InvalidatedConfig = PartialDeep<Config<'withPaths'>, { recurseIntoArrays: true }>;
