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

export const IOS_FILE_TYPES = ['.app', '.tar.gz', '.tar'] as const;

export const DEFAULT_CONFIG_PATH = 'sherlo.config.json';
export const DEFAULT_PROJECT_ROOT = '.';

export const SHERLO_TEMP_DIRECTORY = '.sherlo';
export const SHERLO_TEMP_DATA_FILE = 'data.json';

export const PACKAGE_NAME = '@sherlo/react-native-storybook';

export const MIN_REACT_NATIVE_VERSION = '0.64.0';
export const MIN_STORYBOOK_REACT_NATIVE_VERSION = '7.6.11';
export const MIN_EXPO_UPDATE_EXPO_VERSION = '51.0.0';
