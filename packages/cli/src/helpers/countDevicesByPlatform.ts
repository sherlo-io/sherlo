import { devices } from '@sherlo/shared';
import { Config } from '../types';

type PlatformDeviceCounts = { android?: number; ios?: number };

function countDevicesByPlatform(configDevices: Config['devices']): PlatformDeviceCounts {
  const platformCounts: PlatformDeviceCounts = {};

  configDevices.forEach((deviceConfig) => {
    const device = devices[deviceConfig.id];
    if (device) {
      platformCounts[device.os] = (platformCounts[device.os] || 0) + 1;
    }
  });

  return platformCounts;
}

export default countDevicesByPlatform;
