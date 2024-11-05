import { Platform } from '@sherlo/api-types';
import { devices } from '@sherlo/shared';
import { Config } from '../types';

function getPlatformsToTest(configDevices: Config['devices']): Platform[] {
  const platforms = new Set<'android' | 'ios'>();

  configDevices.forEach((deviceConfig) => {
    const device = devices[deviceConfig.id];

    if (device) platforms.add(device.os);
  });

  return Array.from(platforms);
}

export default getPlatformsToTest;
