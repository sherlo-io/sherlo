import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import { printMessage } from '../helpers';
import { DEFAULT_DEVICES } from './constants';
import printDefaultDevicesMessage from './printDefaultDevicesMessage';
import printProjectAddedMessage from './printProjectAddedMessage';
import writeConfig from './writeConfig';

/** A new config: the project and the default devices. Never a token - the file is committed. */
async function createConfig(
  project: string
): Promise<{ createdConfig: InvalidatedConfig; hasAddedDefaultDevices: boolean }> {
  const config = {
    project,
    devices: DEFAULT_DEVICES,
  };

  await writeConfig(config);

  printMessage({
    type: 'success',
    message: `Created: ${DEFAULT_CONFIG_FILENAME}`,
  });

  printProjectAddedMessage(project);

  printDefaultDevicesMessage();

  return {
    createdConfig: config,
    hasAddedDefaultDevices: true,
  };
}

export default createConfig;
