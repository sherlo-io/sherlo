import { DeviceID, DeviceTheme } from '@sherlo/api-types';
import { PartialDeep } from 'type-fest';
import { iOSFileTypes } from './constants';

export type Mode = 'sync' | 'remoteExpo' | 'asyncInit' | 'asyncUpload';

export type ConfigMode = 'withBuildPaths' | 'withoutBuildPaths';

export type Config<CM extends ConfigMode = 'withBuildPaths'> = CM extends 'withBuildPaths'
  ? BaseConfig & ConfigBuildPaths
  : BaseConfig;

type BaseConfig = {
  token: string;
  devices: {
    id: DeviceID;
    osVersion: string;
    osTheme: DeviceTheme;
    osLanguage: string;
  }[];
};

type ConfigBuildPaths = {
  android?: string;
  ios?: string;
};

export type InvalidatedConfig = PartialDeep<Config, { recurseIntoArrays: true }>;

export type IOSFileType = (typeof iOSFileTypes)[number];
