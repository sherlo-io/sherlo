import { DeviceID, DeviceTheme } from '@sherlo/api-types';
import { PartialDeep } from 'type-fest';
import {
  ANDROID_OPTION,
  BRANCH_OPTION,
  CONFIG_OPTION,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATE_COMMAND,
  INCLUDE_OPTION,
  INIT_COMMAND,
  IOS_FILE_TYPES,
  IOS_OPTION,
  LOCAL_BUILDS_COMMAND,
  MESSAGE_OPTION,
  PROFILE_OPTION,
  PROJECT_ROOT_OPTION,
  TOKEN_OPTION,
  WAIT_FOR_EAS_BUILD_OPTION,
} from './constants';

/* === GENERAL === */

export type Command =
  | typeof LOCAL_BUILDS_COMMAND
  | typeof EXPO_UPDATE_COMMAND
  | typeof EXPO_CLOUD_BUILDS_COMMAND
  | typeof EAS_BUILD_ON_COMPLETE_COMMAND
  | typeof INIT_COMMAND;

export type IOSFileType = (typeof IOS_FILE_TYPES)[number];

/* === CONFIG === */

export type Config = {
  devices: {
    id: DeviceID;
    osVersion: string;
    osTheme: DeviceTheme;
    osLocale: string;
  }[];
  token?: string;
  android?: string;
  ios?: string;
  include?: string[];
  exclude?: string[];
};

export type InvalidatedConfig = PartialDeep<Config, { recurseIntoArrays: true }>;

/* === OPTIONS === */

export type Options<
  C extends Command | 'any',
  M extends OptionsMode = 'withoutDefaults',
  F extends OptionsFormat = 'raw'
> = CommonOptions<M, F> & CommandOptions[C];

type OptionsMode = 'withoutDefaults' | 'withDefaults';
type OptionsFormat = 'raw' | 'normalized';

type CommonOptions<M extends OptionsMode, F extends OptionsFormat> = {
  [MESSAGE_OPTION]?: string;
  [TOKEN_OPTION]?: string;
  [INCLUDE_OPTION]?: F extends 'raw' ? string : string[];
} & (M extends 'withDefaults'
  ? { [CONFIG_OPTION]: string; [PROJECT_ROOT_OPTION]: string }
  : { [CONFIG_OPTION]?: string; [PROJECT_ROOT_OPTION]?: string });

type CommandOptions = {
  [LOCAL_BUILDS_COMMAND]: {
    [ANDROID_OPTION]?: string;
    [IOS_OPTION]?: string;
  };
  [EXPO_UPDATE_COMMAND]: {
    [BRANCH_OPTION]: string;
    [ANDROID_OPTION]?: string;
    [IOS_OPTION]?: string;
    // [EAS_UPDATE_JSON_OUTPUT_OPTION]?: string;
  };
  [EXPO_CLOUD_BUILDS_COMMAND]: {
    [EAS_BUILD_SCRIPT_NAME_OPTION]?: string;
    [WAIT_FOR_EAS_BUILD_OPTION]?: boolean;
  };
  [EAS_BUILD_ON_COMPLETE_COMMAND]: {
    [PROFILE_OPTION]: string;
  };
  [INIT_COMMAND]: {};
  any: Partial<
    CommandOptions[typeof LOCAL_BUILDS_COMMAND] &
      CommandOptions[typeof EXPO_UPDATE_COMMAND] &
      CommandOptions[typeof EXPO_CLOUD_BUILDS_COMMAND] &
      CommandOptions[typeof EAS_BUILD_ON_COMPLETE_COMMAND]
  >;
};

/* === COMMAND PARAMS === */

export type CommandParams<C extends Command | 'any' = 'any'> = Config &
  Options<C, 'withDefaults', 'normalized'> & { token: string };

export type InvalidatedCommandParams<C extends Command | 'any' = 'any'> = InvalidatedConfig &
  Options<C, 'withDefaults', 'normalized'>;

/* === OTHERS === */

export type BinariesInfo = {
  android?: BinaryInfo;
  ios?: BinaryInfo;
};

export type BinaryInfo = {
  hash: string;
  isExpoDev: boolean;
  s3Key: string;
  buildCreatedAt?: string;
  buildIndex?: number;
  sdkVersion?: string;
  url?: string;
};

export type ExpoUpdateInfo = {
  branch: string;
  group: string;
  message: string;
  platforms: string;
};

export type ExpoUpdateData = {
  branch: string;
  message: string;
  updateUrls: { android?: string; ios?: string };
  slug: string;
  author?: string;
  timeAgo?: string;
};
