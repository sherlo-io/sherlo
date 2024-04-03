import { DeviceTheme } from '@sherlo/api-types';
import { PartialDeep } from 'type-fest';

export type Mode = 'sync' | 'asyncInit' | 'asyncUpload';

export type ConfigMode = 'withPaths' | 'withoutPaths';

export type Config<M extends ConfigMode = 'withPaths'> = BaseConfig & {
  apps: {
    android?: BaseConfig['apps']['android'] & PathProperty<M>;
    ios?: BaseConfig['apps']['ios'] & PathProperty<M>;
  };
};
export type BaseConfig = {
  token: string;
  apps: {
    android?: {
      packageName: string;
      activity?: string;
    };
    ios?: {
      bundleIdentifier: string;
    };
  };
  devices: {
    id: string;
    osVersion: string;
    osTheme: DeviceTheme;
    osLanguage: string;
  }[];
};
type PathProperty<M extends ConfigMode> = M extends 'withPaths' ? { path: string } : {};

export type InvalidatedConfig = PartialDeep<Config, { recurseIntoArrays: true }>;
