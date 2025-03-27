import { Platform } from '@sherlo/api-types';

export const APP_DOMAIN = 'https://app.sherlo.io';
const DOCS_DOMAIN = 'https://docs.sherlo.io';

export const CONTACT_EMAIL = 'contact@sherlo.io';
export const DISCORD_URL = 'https://discord.gg/G7eqTBkWZt';

export const DOCS_LINK = {
  setupStorybookComponent: `${DOCS_DOMAIN}/setup/integration#storybook-component`,
  setupStorybookAccess: `${DOCS_DOMAIN}/setup/integration#storybook-access`,

  config: `${DOCS_DOMAIN}/setup/config`,
  configProperties: `${DOCS_DOMAIN}/setup/config#properties`,
  configToken: `${DOCS_DOMAIN}/setup/config#token`,
  configAndroid: `${DOCS_DOMAIN}/setup/config#android`,
  configIos: `${DOCS_DOMAIN}/setup/config#ios`,
  configDevices: `${DOCS_DOMAIN}/setup/config#devices`,

  testing: `${DOCS_DOMAIN}/setup/testing`,
  commandLocalBuilds: `${DOCS_DOMAIN}/setup/testing?command=local-builds#sherlo-commands`,
  commandExpoUpdate: `${DOCS_DOMAIN}/setup/testing?command=expo-update#sherlo-commands`,
  commandExpoCloudBuilds: `${DOCS_DOMAIN}/setup/testing?command=expo-cloud-builds#sherlo-commands`,

  devices: `${DOCS_DOMAIN}/devices`,
};

export const PLATFORMS: readonly Platform[] = ['android', 'ios'];

export const PLATFORM_LABEL: { [platform in Platform]: string } = {
  android: 'Android',
  ios: 'iOS',
};

export const IOS_FILE_TYPES = ['.app', '.tar.gz', '.tar'] as const;

export const DEFAULT_CONFIG_FILENAME = 'sherlo.config.json';
export const DEFAULT_PROJECT_ROOT = '.';

export const SHERLO_TEMP_DIRECTORY = '.sherlo';
export const SHERLO_TEMP_DATA_FILENAME = 'data.json';

/* PACKAGES */

export const EXPO_PACKAGE_NAME = 'expo';
export const EXPO_DEV_CLIENT_PACKAGE_NAME = 'expo-dev-client';
export const REACT_NATIVE_PACKAGE_NAME = 'react-native';
export const SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME = '@sherlo/react-native-storybook';
export const STORYBOOK_REACT_NATIVE_PACKAGE_NAME = '@storybook/react-native';

export const MIN_EXPO_UPDATE_EXPO_VERSION = '51.0.0';
export const MIN_REACT_NATIVE_VERSION = '0.64.0';
export const MIN_STORYBOOK_REACT_NATIVE_VERSION = '7.6.11';

/* COMMANDS */

export const LOCAL_BUILDS_COMMAND = 'local-builds';
export const EXPO_UPDATE_COMMAND = 'expo-update';
export const EXPO_CLOUD_BUILDS_COMMAND = 'expo-cloud-builds';
export const EAS_BUILD_ON_COMPLETE_COMMAND = 'eas-build-on-complete';
export const INIT_COMMAND = 'init';

/* OPTIONS */

export const ANDROID_OPTION = 'android';
export const BRANCH_OPTION = 'branch';
export const CONFIG_OPTION = 'config';
export const EAS_BUILD_SCRIPT_NAME_OPTION = 'easBuildScriptName';
// export const EAS_UPDATE_JSON_OUTPUT_OPTION = 'easUpdateJsonOutput';
export const IOS_OPTION = 'ios';
export const PROFILE_OPTION = 'profile';
export const PROJECT_ROOT_OPTION = 'projectRoot';
export const TOKEN_OPTION = 'token';
export const WAIT_FOR_EAS_BUILD_OPTION = 'waitForEasBuild';

export const COLOR = {
  reported: 'FFB36C',
  approved: '79E8A5',
  noChanges: '64B5F6',
};
