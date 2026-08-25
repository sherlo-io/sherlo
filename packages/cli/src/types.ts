import { DeviceID, DeviceTheme } from '@sherlo/api-types';
import { PartialDeep } from 'type-fest';
import {
  ANDROID_OPTION,
  BRANCH_OPTION,
  CONFIG_OPTION,
  DIAGNOSTICS_OPTION,
  DRY_RUN_OPTION,
  EAS_ANDROID_URL_OPTION,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  EAS_IOS_URL_OPTION,
  EAS_UPDATE_SLUG_OPTION,
  EMIT_EXPECTATION_OPTION,
  RENDER_TRANSCRIPT_OPTION,
  GIT_BRANCH_OPTION,
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
  WAIT_OPTION,
  WAIT_TIMEOUT_OPTION,
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
  [GIT_BRANCH_OPTION]?: string;
  [INCLUDE_OPTION]?: F extends 'raw' ? string : string[];
  [DIAGNOSTICS_OPTION]?: F extends 'raw' ? string : string[];
  [WAIT_OPTION]?: boolean;
  [WAIT_TIMEOUT_OPTION]?: F extends 'raw' ? string : string;
} & (M extends 'withDefaults'
  ? { [CONFIG_OPTION]: string; [PROJECT_ROOT_OPTION]: string }
  : { [CONFIG_OPTION]?: string; [PROJECT_ROOT_OPTION]?: string });

type CommandOptions = {
  [TEST_STANDARD_COMMAND]: {
    [ANDROID_OPTION]?: string;
    [IOS_OPTION]?: string;
    [WAIT_OPTION]?: boolean;
  };
  [TEST_EAS_UPDATE_COMMAND]: {
    [BRANCH_OPTION]: string;
    [ANDROID_OPTION]?: string;
    [IOS_OPTION]?: string;
    // [EAS_UPDATE_JSON_OUTPUT_OPTION]?: string;
    [EAS_ANDROID_URL_OPTION]?: string;
    [EAS_IOS_URL_OPTION]?: string;
    [EAS_UPDATE_SLUG_OPTION]?: string;
    [WAIT_OPTION]?: boolean;
  };
  [TEST_EAS_CLOUD_BUILD_COMMAND]: {
    [EAS_BUILD_SCRIPT_NAME_OPTION]?: string;
    [WAIT_FOR_EAS_BUILD_OPTION]?: boolean;
  };
  [EAS_BUILD_ON_COMPLETE_COMMAND]: {
    [PROFILE_OPTION]: string;
  };
  /**
   * `sherlo test` carries the union of BOTH its roads' options: the native build
   * paths pick the standard road, everything else belongs to the staged one.
   */
  [TEST_COMMAND]: {
    [ANDROID_OPTION]?: string;
    [IOS_OPTION]?: string;
    [WAIT_OPTION]?: boolean;
    /**
     * Preview-only mode (SHERLO-1895 Diff Scope Phase C): bundle + produce the
     * manifest locally, ask the server which stories a real run WOULD capture, print
     * the per-platform decision, and create NO build. Never enables Diff Scope; it
     * is a read-only preview. Staged road only.
     */
    [DRY_RUN_OPTION]?: boolean;
    /**
     * Expectation-emit mode (requires --dry-run): renders the exact refusal text a
     * live run would print for the named preflight scenario, then exits - no
     * bundling, no build, no network. See ../commands/test/emitExpectation.
     */
    [EMIT_EXPECTATION_OPTION]?: string;
    /**
     * Transcript-render mode (requires --dry-run): renders the named scenario's
     * scripted state through the CLI's OWN dry-run code path and writes the bytes
     * it printed, then exits - no bundling, no build, no network. See
     * ../commands/test/renderTranscript.
     */
    [RENDER_TRANSCRIPT_OPTION]?: string;
  };
  [INIT_COMMAND]: {};
  any: Partial<
    CommandOptions[typeof TEST_STANDARD_COMMAND] &
      CommandOptions[typeof TEST_EAS_UPDATE_COMMAND] &
      CommandOptions[typeof TEST_EAS_CLOUD_BUILD_COMMAND] &
      CommandOptions[typeof TEST_COMMAND] &
      CommandOptions[typeof EAS_BUILD_ON_COMPLETE_COMMAND]
  >;
};

/* === COMMAND PARAMS === */

export type CommandParams<C extends Command | 'any' = 'any'> = Config &
  Options<C, 'withDefaults', 'normalized'> & { token: string };

export type InvalidatedCommandParams<C extends Command | 'any' = 'any'> = InvalidatedConfig &
  Options<C, 'withDefaults', 'normalized'>;

/* === OTHERS === */

export type DiagnosticType = 'androidWindowDump' | 'stabilizationFrames' | 'sherloAtRoot';

export type BuildType = 'preview' | 'development';

export type BinariesInfo = {
  android?: BinaryInfo;
  ios?: BinaryInfo;
};

/**
 * What `getValidatedBinariesInfoAndNextBuildIndex` answers: the per-platform
 * binaries PLUS the one `sdkVersion` it lifted off whichever platform carried
 * it. Validation has already refused the run if neither platform had one, so
 * here the field is present, not optional - and `openBuild` reads it off the
 * top level, never off a platform.
 *
 * Anything that stands between that function and the `openBuild` call (an
 * effects seam, a scripted transcript state) must carry THIS type. Typing such
 * a hop as plain `BinariesInfo` silently drops `sdkVersion` from the type while
 * the value still flows at runtime, and the read at the far end stops
 * compiling.
 */
export type ValidatedBinariesInfo = BinariesInfo & { sdkVersion: string };

export type BinaryInfo = {
  hash: string;
  buildType: BuildType;
  fileName: string;
  s3Key: string;
  buildCreatedAt?: string;
  buildIndex?: number;
  sdkVersion?: string;
  url?: string;
  expoSdkVersion?: string;
  hasExpoDevClient?: boolean;
  androidAbis?: string[];
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
