export const appDomain = 'https://app.sherlo.io';
const docsDomain = 'https://docs.sherlo.io';

export const docsLink = {
  config: `${docsDomain}/getting-started/config`,
  configProperties: `${docsDomain}/getting-started/config#properties`,
  configToken: `${docsDomain}/getting-started/config#token`,
  configAndroid: `${docsDomain}/getting-started/config#android`,
  configIos: `${docsDomain}/getting-started/config#ios`,
  configDevices: `${docsDomain}/getting-started/config#devices`,
  devices: `${docsDomain}/devices`,
  remoteExpoBuilds: `${docsDomain}/getting-started/builds?framework=expo&eas-build=remote`,
  sherloScript: `${docsDomain}/getting-started/testing#sherlo-script`,
  scriptFlags: `${docsDomain}/getting-started/testing#supported-flags`,
};

export const iOSFileTypes = ['.app', '.tar.gz', '.tar'] as const;
