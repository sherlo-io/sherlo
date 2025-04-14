import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import { printMessage } from '../helpers';
import { DEFAULT_DEVICES, TOKEN_PLACEHOLDER } from './constants';
import printDefaultDevicesMessage from './printDefaultDevicesMessage';
import printPlaceholderTokenMessage from './printPlaceholderTokenMessage';
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
    token: token ?? config.token ?? TOKEN_PLACEHOLDER,
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

  if (updatedConfig.token === TOKEN_PLACEHOLDER) {
    printPlaceholderTokenMessage();
  }

  return {
    updatedConfig,
    hasAddedDefaultDevices,
  };
}

export default updateConfig;
