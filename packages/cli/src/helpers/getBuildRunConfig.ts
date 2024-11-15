import { BuildRun, Device, Platform } from '@sherlo/api-types';
import { ASYNC_UPLOAD_S3_KEY_PLACEHOLDER, DEVICES } from '@sherlo/shared';
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
    platformUpdateUrls: { android?: string; ios?: string };
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
            expoUpdateUrl: expoUpdateInfo?.platformUpdateUrls.android,
            s3Key: binaryS3Keys?.android || ASYNC_UPLOAD_S3_KEY_PLACEHOLDER,
          }
        : undefined,
    ios:
      iosDevices.length > 0
        ? {
            devices: iosDevices,
            expoUpdateUrl: expoUpdateInfo?.platformUpdateUrls.ios,
            s3Key: binaryS3Keys?.ios || ASYNC_UPLOAD_S3_KEY_PLACEHOLDER,
          }
        : undefined,
  };
}

export default getBuildRunConfig;

/* ========================================================================== */

function getPlatformDevices(configDevices: Config['devices'], platform: Platform): Device[] {
  return configDevices
    .filter(({ id }) => DEVICES[id]?.os === platform)
    .map((device) => ({
      id: device.id,
      osVersion: device.osVersion,
      locale: device.osLocale,
      theme: device.osTheme,
    }));
}
