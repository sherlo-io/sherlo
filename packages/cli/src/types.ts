import { DeviceID, DeviceTheme } from '@sherlo/api-types';
import { PartialDeep } from 'type-fest';
import {
  ANDROID_OPTION,
  BRANCH_OPTION,
  CONFIG_OPTION,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  INCLUDE_OPTION,
  INIT_COMMAND,
  IOS_FILE_TYPES,
  IOS_OPTION,
  MESSAGE_OPTION,
  PROFILE_OPTION,
  PROJECT_ROOT_OPTION,
  TEST_COMMAND,
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TEST_EAS_UPDATE_COMMAND,
  TEST_STANDARD_COMMAND,
  TOKEN_OPTION,
  WAIT_FOR_EAS_BUILD_OPTION,
} from './constants';

/* === GENERAL === */

export type Command =
  | typeof TEST_STANDARD_COMMAND
  | typeof TEST_EAS_UPDATE_COMMAND
  | typeof TEST_EAS_CLOUD_BUILD_COMMAND
  | typeof EAS_BUILD_ON_COMPLETE_COMMAND
  | typeof TEST_COMMAND
  | typeof INIT_COMMAND;

export type IOSFileType = (typeof IOS_FILE_TYPES)[number];

/* === CONFIG === */

export type Config = {
  devices: {
    id: DeviceID;
    osVersion: string;
    theme: DeviceTheme;
    locale: string;
    fontScale: string;
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
  [TEST_STANDARD_COMMAND]: {
    [ANDROID_OPTION]?: string;
    [IOS_OPTION]?: string;
  };
  [TEST_EAS_UPDATE_COMMAND]: {
    [BRANCH_OPTION]: string;
    [ANDROID_OPTION]?: string;
    [IOS_OPTION]?: string;
    // [EAS_UPDATE_JSON_OUTPUT_OPTION]?: string;
  };
  [TEST_EAS_CLOUD_BUILD_COMMAND]: {
    [EAS_BUILD_SCRIPT_NAME_OPTION]?: string;
    [WAIT_FOR_EAS_BUILD_OPTION]?: boolean;
  };
  [EAS_BUILD_ON_COMPLETE_COMMAND]: {
    [PROFILE_OPTION]: string;
  };
  [TEST_COMMAND]: {
    [ANDROID_OPTION]?: string;
    [IOS_OPTION]?: string;
  };
  [INIT_COMMAND]: {};
  any: Partial<
    CommandOptions[typeof TEST_STANDARD_COMMAND] &
      CommandOptions[typeof TEST_EAS_UPDATE_COMMAND] &
      CommandOptions[typeof TEST_EAS_CLOUD_BUILD_COMMAND] &
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
  fileName: string;
  s3Key: string;
  buildCreatedAt?: string;
  buildIndex?: number;
  sdkVersion?: string;
  url?: string;
};

export type EasUpdateInfo = {
  branch: string;
  group: {
    android?: string;
    ios?: string;
  };
  message: string;
};

export type EasUpdateData = {
  branch: string;
  message: string;
  updateUrls: { android?: string; ios?: string };
  slug: string;
  author?: string;
  timeAgo?: string;
};
