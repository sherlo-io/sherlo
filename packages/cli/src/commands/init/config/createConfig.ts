import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import { printMessage } from '../helpers';
import { DEFAULT_DEVICES } from './constants';
import printDefaultDevicesMessage from './printDefaultDevicesMessage';
import writeConfig from './writeConfig';

async function createConfig(
  token?: string
): Promise<{ createdConfig: InvalidatedConfig; hasAddedDefaultDevices: boolean }> {
  const config = {
    ...(token && { token }),
    devices: DEFAULT_DEVICES,
  };

  await writeConfig(config);

  printMessage({
    type: 'success',
    message: `Created: ${DEFAULT_CONFIG_FILENAME}`,
  });

  printDefaultDevicesMessage();

  return {
    createdConfig: config,
    hasAddedDefaultDevices: true,
  };
}

export default createConfig;
