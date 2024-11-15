import { Build, DeviceID, DeviceTheme } from '@sherlo/api-types';
import { PartialDeep } from 'type-fest';
import {
  ANDROID_OPTION,
  CHANNEL_OPTION,
  CONFIG_OPTION,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  EAS_UPDATE_JSON_OUTPUT_OPTION,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATES_COMMAND,
  IOS_FILE_TYPES,
  IOS_OPTION,
  LOCAL_BUILDS_COMMAND,
  PROJECT_ROOT_OPTION,
  WAIT_FOR_EAS_BUILD_OPTION,
  TOKEN_OPTION,
} from './constants';

/* === GENERAL === */

export type Command =
  | typeof LOCAL_BUILDS_COMMAND
  | typeof EXPO_UPDATES_COMMAND
  | typeof EXPO_CLOUD_BUILDS_COMMAND;

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
  DefaultOptions[M] &
  CommandOptions[C];

type OptionsMode = 'withDefaults' | 'withoutDefaults';

type BaseOptions = { [TOKEN_OPTION]?: string; gitInfo?: Build['gitInfo'] };

type DefaultOptions = {
  withDefaults: OptionDefaults;
  withoutDefaults: Partial<OptionDefaults>;
};

type OptionDefaults = { [CONFIG_OPTION]: string; [PROJECT_ROOT_OPTION]: string };

type CommandOptions = {
  [LOCAL_BUILDS_COMMAND]: {
    [ANDROID_OPTION]?: string;
    [IOS_OPTION]?: string;
  };
  [EXPO_UPDATES_COMMAND]: {
    [ANDROID_OPTION]?: string;
    [IOS_OPTION]?: string;
    [CHANNEL_OPTION]?: string;
    [EAS_UPDATE_JSON_OUTPUT_OPTION]?: string;
  };
  [EXPO_CLOUD_BUILDS_COMMAND]: {
    [EAS_BUILD_SCRIPT_NAME_OPTION]?: string;
    [WAIT_FOR_EAS_BUILD_OPTION]?: boolean;
  };
  any: CommandOptions[typeof LOCAL_BUILDS_COMMAND] &
    CommandOptions[typeof EXPO_UPDATES_COMMAND] &
    CommandOptions[typeof EXPO_CLOUD_BUILDS_COMMAND];
};
