import { BuildRun, Device, Platform } from '@sherlo/api-types';
import { ASYNC_UPLOAD_S3_KEY_PLACEHOLDER, getPlatformFromDeviceId } from '@sherlo/shared';
import { CommandParams, Config } from '../types';

function getBuildRunConfig({
  commandParams,
  binaryS3Keys,
}: {
  commandParams: CommandParams;
  binaryS3Keys?: { android?: string; ios?: string };
}): BuildRun<'withS3KeyNoDebug'>['config'] & { diagnostics?: string[] } {
  const { devices, include, exclude, diagnostics } = commandParams;

  const androidDevices = getPlatformDevices(devices, 'android');
  const iosDevices = getPlatformDevices(devices, 'ios');

  return {
    include,
    exclude,
    android:
      androidDevices.length > 0
        ? {
            devices: androidDevices,
            s3Key: binaryS3Keys?.android || ASYNC_UPLOAD_S3_KEY_PLACEHOLDER,
          }
        : undefined,
    ios:
      iosDevices.length > 0
        ? {
            devices: iosDevices,
            s3Key: binaryS3Keys?.ios || ASYNC_UPLOAD_S3_KEY_PLACEHOLDER,
          }
        : undefined,
    ...(diagnostics !== undefined ? { diagnostics } : {}),
  };
}

export default getBuildRunConfig;

/* ========================================================================== */

function getPlatformDevices(configDevices: Config['devices'], platform: Platform): Device[] {
  return configDevices
    .filter(({ id }) => getPlatformFromDeviceId(id) === platform)
    .map(({ theme, locale, fontScale, ...rest }) => ({
      osTheme: theme,
      osLocale: locale,
      osFontScale: fontScale,
      ...rest,
    }));
}
