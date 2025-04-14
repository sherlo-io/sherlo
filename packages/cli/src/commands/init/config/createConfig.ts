import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import { printMessage } from '../helpers';
import { DEFAULT_DEVICES, TOKEN_PLACEHOLDER } from './constants';
import printDefaultDevicesMessage from './printDefaultDevicesMessage';
import printPlaceholderTokenMessage from './printPlaceholderTokenMessage';
import writeConfig from './writeConfig';

async function createConfig(
  token?: string
): Promise<{ createdConfig: InvalidatedConfig; hasAddedDefaultDevices: boolean }> {
  const config = {
    token: token ?? TOKEN_PLACEHOLDER,
    devices: DEFAULT_DEVICES,
  };

  await writeConfig(config);

  printMessage({
    type: 'success',
    message: `Created: ${DEFAULT_CONFIG_FILENAME}`,
  });

  printDefaultDevicesMessage();

  if (config.token === TOKEN_PLACEHOLDER) {
    printPlaceholderTokenMessage();
  }

  return {
    createdConfig: config,
    hasAddedDefaultDevices: true,
  };
}

export default createConfig;
