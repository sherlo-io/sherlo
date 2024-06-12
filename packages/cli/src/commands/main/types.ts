import { DeviceID, DeviceTheme } from '@sherlo/api-types';
import { PartialDeep } from 'type-fest';
import { iOSFileTypes } from './constants';

export type Mode = 'sync' | 'asyncInit' | 'asyncUpload';

export type ConfigMode = 'withPaths' | 'withoutPaths';

export type Config<CM extends ConfigMode = 'withPaths'> = {
  token: string;
  include?: string[];
  exclude?: string[];
  android?: {
    packageName?: string;
    activity?: string;
  } & PathProperty<CM>;
  ios?: {
    bundleIdentifier?: string;
  } & PathProperty<CM>;
  devices: {
    id: DeviceID;
    osVersion: string;
    osTheme: DeviceTheme;
    osLanguage: string;
  }[];
};

type PathProperty<CM extends ConfigMode> = CM extends 'withPaths' ? { path: string } : {};

export type InvalidatedConfig = PartialDeep<Config, { recurseIntoArrays: true }>;

export type IOSFileType = (typeof iOSFileTypes)[number];
