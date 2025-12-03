import { BuildRun, Device, Platform } from '@sherlo/api-types';
import { ASYNC_UPLOAD_S3_KEY_PLACEHOLDER, getPlatformFromDeviceId } from '@sherlo/shared';
import { CommandParams, Config, EasUpdateData } from '../types';

function getBuildRunConfig({
  commandParams,
  binaryS3Keys,
  easUpdateData,
}: {
  commandParams: CommandParams;
  binaryS3Keys?: { android?: string; ios?: string };
  easUpdateData?: EasUpdateData;
}): BuildRun<'withS3KeyNoDebug'>['config'] {
  const { devices, include, exclude } = commandParams;

  const androidDevices = getPlatformDevices(devices, 'android');
  const iosDevices = getPlatformDevices(devices, 'ios');

  return {
    include,
    exclude,
    easUpdateSlug: easUpdateData?.slug,
    android:
      androidDevices.length > 0
        ? {
            devices: androidDevices,
            easUpdateUrl: easUpdateData?.updateUrls.android,
            s3Key: binaryS3Keys?.android || ASYNC_UPLOAD_S3_KEY_PLACEHOLDER,
          }
        : undefined,
    ios:
      iosDevices.length > 0
        ? {
            devices: iosDevices,
            easUpdateUrl: easUpdateData?.updateUrls.ios,
            s3Key: binaryS3Keys?.ios || ASYNC_UPLOAD_S3_KEY_PLACEHOLDER,
          }
        : undefined,
  };
}

export default getBuildRunConfig;

/* ========================================================================== */

function getPlatformDevices(configDevices: Config['devices'], platform: Platform): Device[] {
  return configDevices
    .filter(({ id }) => getPlatformFromDeviceId(id) === platform)
    .map(({ theme, locale, fontScale, ...rest }) => ({ osTheme: theme, osLocale: locale, osFontScale: fontScale, ...rest }));
}
