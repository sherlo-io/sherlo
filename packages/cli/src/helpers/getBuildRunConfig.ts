import { BuildRun, Device, Platform } from '@sherlo/api-types';
import { ASYNC_UPLOAD_S3_KEY_PLACEHOLDER, DEVICES } from '@sherlo/shared';
import { CommandParams, Config, ExpoUpdateData } from '../types';

function getBuildRunConfig({
  commandParams,
  binaryS3Keys,
  expoUpdateData,
}: {
  commandParams: CommandParams;
  binaryS3Keys?: { android?: string; ios?: string };
  expoUpdateData?: ExpoUpdateData;
}): BuildRun['config'] {
  const { devices, include, exclude } = commandParams;

  const androidDevices = getPlatformDevices(devices, 'android');
  const iosDevices = getPlatformDevices(devices, 'ios');

  return {
    include,
    exclude,
    expoUpdateSlug: expoUpdateData?.slug,
    android:
      androidDevices.length > 0
        ? {
            devices: androidDevices,
            expoUpdateUrl: expoUpdateData?.updateUrls.android,
            s3Key: binaryS3Keys?.android || ASYNC_UPLOAD_S3_KEY_PLACEHOLDER,
          }
        : undefined,
    ios:
      iosDevices.length > 0
        ? {
            devices: iosDevices,
            expoUpdateUrl: expoUpdateData?.updateUrls.ios,
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
