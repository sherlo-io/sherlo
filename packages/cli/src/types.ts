import { Build, DeviceID, DeviceTheme } from '@sherlo/api-types';
import { PartialDeep } from 'type-fest';
import { IOS_FILE_TYPES } from './constants';

/* === GENERAL === */

export type Command = 'local-builds' | 'expo-update' | 'expo-cloud';

export type IOSFileType = (typeof IOS_FILE_TYPES)[number];

/* === CONFIG === */

export type Config<CM extends ConfigMode = 'withBuildPaths'> = CM extends 'withBuildPaths'
  ? BaseConfig & ConfigBuildPaths
  : BaseConfig;

export type ConfigMode = 'withBuildPaths' | 'withoutBuildPaths';

type BaseConfig = {
  token: string;
  include?: string[];
  exclude?: string[];
  devices: {
    id: DeviceID;
    osVersion: string;
    osTheme: DeviceTheme;
    osLocale: string;
  }[];
};

type ConfigBuildPaths = {
  android?: string;
  ios?: string;
};

export type InvalidatedConfig = PartialDeep<Config, { recurseIntoArrays: true }>;

/* === OPTIONS === */

export type Options<C extends Command | 'any', M extends OptionsMode> = BaseOptions &
  CommandOptions[C] &
  DefaultOptions[M];

type OptionsMode = 'withDefaults' | 'withoutDefaults';

type BaseOptions = { token?: string; gitInfo?: Build['gitInfo'] };

type CommandOptions = {
  'local-builds': {
    android?: string;
    ios?: string;
  };
  'expo-update': {
    androidUpdateUrl?: string;
    iosUpdateUrl?: string;
    android?: string;
    ios?: string;
  };
  'expo-cloud': {
    buildScript?: string;
    manual?: boolean;
  };
  any: {
    android?: string;
    ios?: string;
    androidUpdateUrl?: string;
    iosUpdateUrl?: string;
    buildScript?: string;
    manual?: boolean;
  };
};

type DefaultOptions = {
  withDefaults: OptionDefaults;
  withoutDefaults: Partial<OptionDefaults>;
};

type OptionDefaults = { config: string; projectRoot: string };
