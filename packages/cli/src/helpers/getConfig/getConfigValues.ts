import { defaultDeviceOsLocale, defaultDeviceOsTheme } from '@sherlo/shared';
import path from 'path';
import { InvalidatedConfig } from '../../types';
import logWarning from '../logWarning';

// TODO: wyniesc do wspolnego miejsca
type Options<T extends 'default' | 'withDefaults' = 'default'> = {
  token?: string; // only CLI
  android?: string;
  ios?: string;
  // remoteExpo?: boolean;
  // remoteExpoBuildScript?: string;
  // async?: boolean;
  // asyncBuildIndex?: number;
  // TODO: gitInfo?: Build['gitInfo']; // Can be passed only in GitHub Action
} & (T extends 'withDefaults' ? OptionDefaults : Partial<OptionDefaults>);
type OptionDefaults = { config: string; projectRoot: string };

function getConfigValues(
  configFile: InvalidatedConfig,
  options: Options<'withDefaults'>
): InvalidatedConfig {
  // Take token from options or config file
  const token = options.token ?? configFile.token;

  // Set a proper android path
  let android = options.android ?? configFile.android;
  android = android ? path.resolve(options.projectRoot, android) : undefined;

  // Set a proper ios path
  let ios = options.ios ?? configFile.ios;
  ios = ios ? path.resolve(options.projectRoot, ios) : undefined;

  // Set defaults for devices and remove duplicates
  const devices = removeDuplicateDevices(
    configFile.devices?.map((device) => ({
      ...device,
      osLocale: device?.osLocale ?? defaultDeviceOsLocale,
      osTheme: device?.osTheme ?? defaultDeviceOsTheme,
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
