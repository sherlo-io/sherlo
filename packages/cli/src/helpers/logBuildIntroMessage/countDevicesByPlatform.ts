import { DEVICES } from '@sherlo/shared';
import { Config } from '../../types';

type PlatformDeviceCounts = { android: number; ios: number };

function countDevicesByPlatform(configDevices: Config['devices']): PlatformDeviceCounts {
  const platformCounts: PlatformDeviceCounts = {
    android: 0,
    ios: 0,
  };

  configDevices.forEach((deviceConfig) => {
    const device = DEVICES[deviceConfig.id];

    if (device) platformCounts[device.os] += 1;
  });

  return platformCounts;
}

export default countDevicesByPlatform;
