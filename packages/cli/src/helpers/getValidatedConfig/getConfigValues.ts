import { DEFAULT_DEVICE_OS_LOCALE, DEFAULT_DEVICE_OS_THEME } from '@sherlo/shared';
import path from 'path';
import { InvalidatedConfig, Options } from '../../types';
import logWarning from '../logWarning';

/**
 * 1. `android` and `ios` can be defined as any value in the config.
 *    Converting to string is required as path.resolve accepts only strings.
 */
function getConfigValues(
  configFile: InvalidatedConfig,
  options: Options<'any', 'withDefaults'>
): InvalidatedConfig {
  const { projectRoot } = options;

  // Take token from options or config file
  const token = options.token ?? configFile.token;

  // Set a proper android path
  let android = options.android ?? configFile.android;
  android = android ? path.resolve(projectRoot, android.toString() /* 1 */) : undefined;

  // Set a proper ios path
  let ios = options.ios ?? configFile.ios;
  ios = ios ? path.resolve(projectRoot, ios.toString() /* 1 */) : undefined;

  // Set defaults for devices and remove duplicates
  const devices = removeDuplicateDevices(
    configFile.devices?.map((device) => ({
      ...device,
      osLocale: device?.osLocale ?? DEFAULT_DEVICE_OS_LOCALE,
      osTheme: device?.osTheme ?? DEFAULT_DEVICE_OS_THEME,
    }))
  );

  return {
    ...configFile,
    token,
    android,
    ios,
    devices,
  };
}

export default getConfigValues;

/* ========================================================================== */

/**
 * Removes duplicate devices while keeping all entries, including incomplete ones.
 * Validation of devices will be performed at a later stage.
 */
function removeDuplicateDevices(
  devices: InvalidatedConfig['devices']
): InvalidatedConfig['devices'] {
  if (!devices || !Array.isArray(devices)) {
    return devices;
  }

  const uniqueDevices = new Set<string>();

  return devices.filter((device) => {
    if (!device) return true; // Keep even undefined devices

    const { id, osVersion, osTheme, osLocale } = device;
    const key = JSON.stringify({ id, osVersion, osTheme, osLocale }, null, 1)
      .replace(/\n/g, '')
      .replace(/}$/, ' }');

    if (uniqueDevices.has(key)) {
      logWarning({ type: 'config', message: `duplicated device ${key}` });

      return false;
    }

    uniqueDevices.add(key);

    return true;
  });
}
