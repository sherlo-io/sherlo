import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import { printMessage } from '../helpers';
import { DEFAULT_DEVICES } from './constants';
import printDefaultDevicesMessage from './printDefaultDevicesMessage';
import readConfig from './readConfig';
import writeConfig from './writeConfig';

async function updateConfig(
  token?: string
): Promise<{ updatedConfig: InvalidatedConfig; hasAddedDefaultDevices: boolean }> {
  const config = await readConfig();
  const hasDevices = Array.isArray(config.devices) && config.devices.length > 0;
  let hasAddedDefaultDevices = false;

  const updatedConfig = {
    ...config,
    ...(token && { token }),
    devices: hasDevices ? config.devices : DEFAULT_DEVICES,
  };

  await writeConfig(updatedConfig);

  printMessage({
    type: 'success',
    message:
      token && token !== config.token
        ? `Updated token: ${DEFAULT_CONFIG_FILENAME}`
        : `Already created: ${DEFAULT_CONFIG_FILENAME}`,
  });

  if (!hasDevices) {
    printDefaultDevicesMessage();
    hasAddedDefaultDevices = true;
  }

  return {
    updatedConfig,
    hasAddedDefaultDevices,
  };
}

export default updateConfig;
