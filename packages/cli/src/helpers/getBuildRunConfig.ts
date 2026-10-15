import { BuildRun, Device, Platform } from '@sherlo/api-types';
import { ASYNC_UPLOAD_S3_KEY_PLACEHOLDER, getPlatformFromDeviceId } from '@sherlo/shared';
import { CommandParams, Config } from '../types';

function getBuildRunConfig({
  commandParams,
  binaryS3Keys,
  wholeTest = false,
}: {
  commandParams: CommandParams;
  binaryS3Keys?: { android?: string; ios?: string };
  /**
   * For one job of a split CI run (`--platform`): name every device of the test, not only this
   * job's, so the test waits for the platform the other job brings instead of leaving it out.
   */
  wholeTest?: boolean;
}): BuildRun<'withS3KeyNoDebug'>['config'] & { diagnostics?: string[] } {
  const { include, exclude, diagnostics } = commandParams;
  const devices = wholeTest ? testDevicesOf(commandParams) : commandParams.devices;

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

/**
 * The config's whole device list, which ./getValidatedCommandParams/getCommandParams keeps beside
 * the job's own `devices` (cut to `--platform`).
 */
function testDevicesOf(commandParams: CommandParams): Config['devices'] {
  return (
    (commandParams as { testDevices?: Config['devices'] }).testDevices ?? commandParams.devices
  );
}

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
