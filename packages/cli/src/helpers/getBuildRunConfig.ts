import { BuildRun, Device, GetBuildUploadUrlsReturn, Platform } from '@sherlo/api-types';
import { devices as sherloDevices } from '@sherlo/shared';
import { Config } from '../types';

function getBuildRunConfig({
  config,
  buildPresignedUploadUrls,
  expoUpdateInfo,
}: {
  config: Config<'withBuildPaths'> | Config<'withoutBuildPaths'>;
  buildPresignedUploadUrls?: GetBuildUploadUrlsReturn['buildPresignedUploadUrls'];
  expoUpdateInfo?: {
    slug: string;
    androidUrl?: string;
    iosUrl?: string;
  };
}): BuildRun['config'] {
  const { devices, include, exclude } = config;

  const androidDevices = getPlatformDevices(devices, 'android');
  const iosDevices = getPlatformDevices(devices, 'ios');

  return {
    include,
    exclude,
    expoUpdateSlug: expoUpdateInfo?.slug,
    android:
      androidDevices.length > 0
        ? {
            devices: androidDevices,
            expoUpdateUrl: expoUpdateInfo?.androidUrl,
            s3Key: buildPresignedUploadUrls?.android?.s3Key || '',
          }
        : undefined,
    ios:
      iosDevices.length > 0
        ? {
            devices: iosDevices,
            expoUpdateUrl: expoUpdateInfo?.iosUrl,
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
