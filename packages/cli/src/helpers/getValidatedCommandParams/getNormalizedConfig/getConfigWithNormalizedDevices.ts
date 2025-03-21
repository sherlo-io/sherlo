import { DEFAULT_DEVICE_OS_LOCALE, DEFAULT_DEVICE_OS_THEME } from '@sherlo/shared';
import { Config, InvalidatedConfig } from '../../../types';
import logWarning from '../../logWarning';

function getConfigWithNormalizedDevices(config: InvalidatedConfig): InvalidatedConfig {
  let devices = removeDuplicatedDevices(config.devices);

  devices = getDevicesWithDefaults(devices);

  return {
    ...config,
    devices,
  };
}

export default getConfigWithNormalizedDevices;

/* ========================================================================== */

/**
 * Removes duplicated devices while keeping all entries, including incomplete ones.
 * Validation of devices will be performed at a later stage.
 */
function removeDuplicatedDevices(
  devices: InvalidatedConfig['devices']
): InvalidatedConfig['devices'] {
  if (!devices || !Array.isArray(devices)) {
    return devices;
  }

  const uniqueDevices = new Set<string>();

  return devices.filter((device) => {
    if (!device) return true; // Keep even undefined devices

    const deviceKey = getDeviceKey(device);

    if (uniqueDevices.has(deviceKey)) {
      logWarning({ message: `Duplicated device found in config: \`${deviceKey}\`` });

      console.log();

      return false;
    }

    uniqueDevices.add(deviceKey);

    return true;
  });
}

function getDeviceKey(device: Partial<Config['devices'][number]>) {
  const { id, osVersion, osTheme, osLocale } = device;

  const parts = [
    id && `id: ${id}`,
    osVersion && `osVersion: ${osVersion}`,
    osTheme && `osTheme: ${osTheme}`,
    osLocale && `osLocale: ${osLocale}`,
  ].filter(Boolean);

  return parts.join(', ');
}

function getDevicesWithDefaults(
  devices: InvalidatedConfig['devices']
): InvalidatedConfig['devices'] {
  if (!Array.isArray(devices)) {
    return devices;
  }

  return devices?.map((device) => ({
    ...device,
    osLocale: device?.osLocale ?? DEFAULT_DEVICE_OS_LOCALE,
    osTheme: device?.osTheme ?? DEFAULT_DEVICE_OS_THEME,
  }));
}
