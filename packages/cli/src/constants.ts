import { Platform } from '@sherlo/api-types';

export const APP_DOMAIN = 'https://app.sherlo.io';
const DOCS_BASE_URL = 'https://sherlo.io/docs';

export const CONTACT_EMAIL = 'contact@sherlo.io';
export const DISCORD_URL = 'https://discord.gg/G7eqTBkWZt';

export const DOCS_LINK = {
  setupStorybookComponent: `${DOCS_BASE_URL}/setup#storybook-component`,
  setupStorybookAccess: `${DOCS_BASE_URL}/setup#storybook-access`,

  config: `${DOCS_BASE_URL}/config`,
  configProperties: `${DOCS_BASE_URL}/config#properties`,
  configToken: `${DOCS_BASE_URL}/config#token`,
  configAndroid: `${DOCS_BASE_URL}/config#android`,
  configIos: `${DOCS_BASE_URL}/config#ios`,
  configDevices: `${DOCS_BASE_URL}/config#devices`,

  builds: `${DOCS_BASE_URL}/builds`,
  buildPreview: `${DOCS_BASE_URL}/builds?type=preview-simulator#build-types`,
  buildDevelopment: `${DOCS_BASE_URL}/builds?type=development-simulator#build-types`,

  testing: `${DOCS_BASE_URL}/testing`,
  testingMethods: `${DOCS_BASE_URL}/testing#testing-methods`,
  testStandard: `${DOCS_BASE_URL}/testing?method=standard#testing-methods`,
  testEasUpdate: `${DOCS_BASE_URL}/testing?method=eas-update#testing-methods`,
  testEasCloudBuild: `${DOCS_BASE_URL}/testing?method=eas-cloud-build#testing-methods`,

  devices: `${DOCS_BASE_URL}/devices`,
};

export const PLATFORMS: readonly Platform[] = ['android', 'ios'];

export const PLATFORM_LABEL: { [platform in Platform]: string } = {
  android: 'Android',
  ios: 'iOS',
};

export const ANDROID_FILE_TYPES = ['.apk'] as const;
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

export const MIN_EAS_UPDATE_EXPO_VERSION = '51.0.0';
export const MIN_REACT_NATIVE_VERSION = '0.64.0';
export const MIN_STORYBOOK_REACT_NATIVE_VERSION = '7.6.11';

/* COMMANDS */

export const INIT_COMMAND = 'init';
export const TEST_COMMAND = 'test';
export const TEST_STANDARD_COMMAND = 'test:standard';
export const TEST_EAS_UPDATE_COMMAND = 'test:eas-update';
export const TEST_EAS_CLOUD_BUILD_COMMAND = 'test:eas-cloud-build';
export const EAS_BUILD_ON_COMPLETE_COMMAND = 'eas-build-on-complete';
export const FULL_INIT_COMMAND = 'npx sherlo@latest init';

/* OPTIONS */

export const API_URL_OPTION = 'apiUrl';
export const ANDROID_OPTION = 'android';
export const BRANCH_OPTION = 'branch';
export const CONFIG_OPTION = 'config';
export const EAS_BUILD_SCRIPT_NAME_OPTION = 'easBuildScriptName';
// export const EAS_UPDATE_JSON_OUTPUT_OPTION = 'easUpdateJsonOutput';
export const IOS_OPTION = 'ios';
export const MESSAGE_OPTION = 'message';
export const PROFILE_OPTION = 'profile';
export const PROJECT_ROOT_OPTION = 'projectRoot';
export const TOKEN_OPTION = 'token';
export const INCLUDE_OPTION = 'include';
export const WAIT_FOR_EAS_BUILD_OPTION = 'waitForEasBuild';

export const COLOR = {
  reported: 'FFB36C',
  approved: '79E8A5',
  noChanges: '64B5F6',
};
