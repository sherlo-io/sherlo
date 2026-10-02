import { renderConfigWritten } from '../../../render/initConfig';
import { InvalidatedConfig } from '../../../types';
import { printLines } from '../helpers';
import { DEFAULT_DEVICES } from './constants';
import readConfig from './readConfig';
import writeConfig from './writeConfig';

async function updateConfig(
  token?: string
): Promise<{ updatedConfig: InvalidatedConfig; hasAddedDefaultDevices: boolean }> {
  const config = await readConfig();
  const hasDevices = Array.isArray(config.devices) && config.devices.length > 0;
  const hasAddedDefaultDevices = !hasDevices;

  const updatedConfig = {
    ...config,
    ...(token && { token }),
    devices: hasDevices ? config.devices : DEFAULT_DEVICES,
  };

  await writeConfig(updatedConfig);

  printLines(
    renderConfigWritten({
      outcome: token && token !== config.token ? 'token-updated' : 'already-created',
      hasToken: Boolean(updatedConfig.token),
      addedDevices: hasAddedDefaultDevices ? DEFAULT_DEVICES : [],
    })
  );

  return {
    updatedConfig,
    hasAddedDefaultDevices,
  };
}

export default updateConfig;
