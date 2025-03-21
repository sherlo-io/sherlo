import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import { printMessage } from '../helpers';
import { DEFAULT_DEVICE, TOKEN_PLACEHOLDER } from './constants';
import printDefaultDeviceInfo from './printDefaultDeviceInfo';
import printPlaceholderTokenMessage from './printPlaceholderTokenMessage';
import writeConfig from './writeConfig';

async function createConfig(token?: string): Promise<InvalidatedConfig> {
  const config = {
    token: token ?? TOKEN_PLACEHOLDER,
    devices: [DEFAULT_DEVICE],
  };

  await writeConfig(config);

  printMessage({
    type: 'success',
    message: `Created: ${DEFAULT_CONFIG_FILENAME}`,
  });

  printDefaultDeviceInfo();

  if (config.token === TOKEN_PLACEHOLDER) {
    console.log();

    printPlaceholderTokenMessage();
  }

  return config;
}

export default createConfig;
