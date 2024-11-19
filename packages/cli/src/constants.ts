import { Platform } from '@sherlo/api-types';
export const APP_DOMAIN = 'https://app.sherlo.io';
const DOCS_DOMAIN = 'https://docs.sherlo.io';

export const DOCS_LINK = {
  config: `${DOCS_DOMAIN}/getting-started/config`,
  configProperties: `${DOCS_DOMAIN}/getting-started/config#properties`,
  configToken: `${DOCS_DOMAIN}/getting-started/config#token`,
  configAndroid: `${DOCS_DOMAIN}/getting-started/config#android`,
  configIos: `${DOCS_DOMAIN}/getting-started/config#ios`,
  configDevices: `${DOCS_DOMAIN}/getting-started/config#devices`,
  devices: `${DOCS_DOMAIN}/devices`,
  remoteExpoBuilds: `${DOCS_DOMAIN}/getting-started/builds?framework=expo&eas-build=remote#preparing-builds`,
  sherloScriptLocalBuilds: `${DOCS_DOMAIN}/getting-started/testing?builds-type=local#sherlo-script`,
  sherloScriptExpoRemoteBuilds: `${DOCS_DOMAIN}/getting-started/testing?builds-type=expo-remote#sherlo-script`,
  sherloScriptFlags: `${DOCS_DOMAIN}/getting-started/testing#supported-flags`,
  expoUpdate: `${DOCS_DOMAIN}/getting-started/expo-update`, // TODO: Add correct documentation link for expo-update
};

export const PLATFORM_LABEL: { [platform in Platform]: string } = {
  android: 'Android',
  ios: 'iOS',
};

export const IOS_FILE_TYPES = ['.app', '.tar.gz', '.tar'] as const;

export const DEFAULT_CONFIG_PATH = 'sherlo.config.json';
export const DEFAULT_PROJECT_ROOT = '.';

export const SHERLO_TEMP_DIRECTORY = '.sherlo';
export const SHERLO_TEMP_DATA_FILE = 'data.json';

export const PACKAGE_NAME = '@sherlo/react-native-storybook';

export const MIN_REACT_NATIVE_VERSION = '0.64.0';
export const MIN_STORYBOOK_REACT_NATIVE_VERSION = '7.6.11';
export const MIN_EXPO_UPDATE_EXPO_VERSION = '51.0.0';

/* COMMANDS */

export const LOCAL_BUILDS_COMMAND = 'local-builds';
export const EXPO_UPDATES_COMMAND = 'expo-updates';
export const EXPO_CLOUD_BUILDS_COMMAND = 'expo-cloud-builds';
export const EAS_BUILD_ON_COMPLETE_COMMAND = 'eas-build-on-complete';

/* OPTIONS */

export const ANDROID_OPTION = 'android';
export const CHANNEL_OPTION = 'channel';
export const CONFIG_OPTION = 'config';
export const EAS_BUILD_SCRIPT_NAME_OPTION = 'easBuildScriptName';
// export const EAS_UPDATE_JSON_OUTPUT_OPTION = 'easUpdateJsonOutput';
export const IOS_OPTION = 'ios';
export const PROFILE_OPTION = 'profile';
export const PROJECT_ROOT_OPTION = 'projectRoot';
export const TOKEN_OPTION = 'token';
export const WAIT_FOR_EAS_BUILD_OPTION = 'waitForEasBuild';
