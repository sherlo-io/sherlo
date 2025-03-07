import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import { printMessage } from '../helpers';
import { DEFAULT_DEVICE, TOKEN_PLACEHOLDER } from './constants';
import printDefaultDeviceInfo from './printDefaultDeviceInfo';
import printPlaceholderTokenMessage from './printPlaceholderTokenMessage';
import readConfig from './readConfig';
import writeConfig from './writeConfig';

async function updateConfig(token?: string): Promise<InvalidatedConfig> {
  const config = await readConfig();
  const hasDevices = !!config.devices?.length;

  const updatedConfig = {
    ...config,
    token: token ?? config.token ?? TOKEN_PLACEHOLDER,
    devices: hasDevices ? config.devices : [DEFAULT_DEVICE],
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
    printDefaultDeviceInfo();
  }

  if (updatedConfig.token === TOKEN_PLACEHOLDER) {
    if (!hasDevices) {
      console.log();
    }

    printPlaceholderTokenMessage();
  }

  return updatedConfig;
}

export default updateConfig;
