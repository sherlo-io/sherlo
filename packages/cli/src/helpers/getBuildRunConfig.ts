import { BuildRun, Device, Platform } from '@sherlo/api-types';
import { devices as sherloDevices } from '@sherlo/shared';
import { Config } from '../types';

function getBuildRunConfig({
  config,
  binaryS3Keys,
  expoUpdateInfo,
}: {
  config: Config<'withBuildPaths'> | Config<'withoutBuildPaths'>;
  binaryS3Keys?: { android?: string; ios?: string };
  expoUpdateInfo?: {
    slug: string;
    androidUpdateUrl?: string;
    iosUpdateUrl?: string;
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
            expoUpdateUrl: expoUpdateInfo?.androidUpdateUrl,
            s3Key: binaryS3Keys?.android || 'WAITING_FOR_ASYNC_UPLOAD',
          }
        : undefined,
    ios:
      iosDevices.length > 0
        ? {
            devices: iosDevices,
            expoUpdateUrl: expoUpdateInfo?.iosUpdateUrl,
            s3Key: binaryS3Keys?.ios || 'WAITING_FOR_ASYNC_UPLOAD',
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
