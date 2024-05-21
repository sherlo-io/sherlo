import { BuildRunConfig, Device, GetBuildUploadUrlsReturn, Platform } from '@sherlo/api-types';
import { devices as sherloDevices } from '@sherlo/shared';
import { Config } from '../../types';

function getBuildRunConfig({
  buildPresignedUploadUrls,
  config,
}: {
  buildPresignedUploadUrls?: GetBuildUploadUrlsReturn['buildPresignedUploadUrls'];
  config: Config<'withPaths'> | Config<'withoutPaths'>;
}): BuildRunConfig {
  const { android, ios, devices } = config;

  const androidDevices = getConvertedDevices(devices, 'android');
  const iosDevices = getConvertedDevices(devices, 'ios');

  return {
    // include,
    // exclude,
    android: android
      ? {
          devices: androidDevices,
          packageName: android.packageName,
          activity: android.activity,
          s3Key: buildPresignedUploadUrls?.android?.s3Key || '',
        }
      : undefined,
    ios: ios
      ? {
          devices: iosDevices,
          bundleIdentifier: ios.bundleIdentifier,
          s3Key: buildPresignedUploadUrls?.ios?.s3Key || '',
        }
      : undefined,
  };
}

export default getBuildRunConfig;

/* ========================================================================== */

function getConvertedDevices(devices: Config['devices'], platform: Platform): Device[] {
  return devices
    .filter(({ id }) => sherloDevices[id]?.os === platform)
    .map((device) => ({
      id: device.id,
      osVersion: device.osVersion,
      locale: device.osLanguage,
      theme: device.osTheme,
    }));
}
