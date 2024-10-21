import { BuildRun, Device, GetBuildUploadUrlsReturn, Platform } from '@sherlo/api-types';
import { devices as sherloDevices } from '@sherlo/shared';
import { Config } from '../../types';

function getBuildRunConfig({
  buildPresignedUploadUrls,
  config,
}: {
  buildPresignedUploadUrls?: GetBuildUploadUrlsReturn['buildPresignedUploadUrls'];
  config: Config<'withBuildPaths'> | Config<'withoutBuildPaths'>;
}): BuildRun['config'] {
  const { devices, include, exclude } = config;

  const androidDevices = getPlatformDevices(devices, 'android');
  const iosDevices = getPlatformDevices(devices, 'ios');

  return {
    include,
    exclude,
    android:
      androidDevices.length > 0
        ? {
            devices: androidDevices,
            // packageName: android.packageName,
            // activity: android.activity,
            s3Key: buildPresignedUploadUrls?.android?.s3Key || '',
          }
        : undefined,
    ios:
      iosDevices.length > 0
        ? {
            devices: iosDevices,
            // bundleIdentifier: ios.bundleIdentifier,
            s3Key: buildPresignedUploadUrls?.ios?.s3Key || '',
          }
        : undefined,
  };
}

export default getBuildRunConfig;

/* ========================================================================== */

function getPlatformDevices(configDevices: Config['devices'], platform: Platform): Device[] {
  return configDevices
    .filter(({ id }) => sherloDevices[id]?.os === platform)
    .map((device) => ({
      id: device.id,
      osVersion: device.osVersion,
      locale: device.osLocale,
      theme: device.osTheme,
    }));
}
