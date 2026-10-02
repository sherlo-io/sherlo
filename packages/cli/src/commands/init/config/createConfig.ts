import { renderConfigWritten } from '../../../render/initConfig';
import { InvalidatedConfig } from '../../../types';
import { printLines } from '../helpers';
import { DEFAULT_DEVICES } from './constants';
import writeConfig from './writeConfig';

async function createConfig(
  token?: string
): Promise<{ createdConfig: InvalidatedConfig; hasAddedDefaultDevices: boolean }> {
  const config = {
    ...(token && { token }),
    devices: DEFAULT_DEVICES,
  };

  await writeConfig(config);

  printLines(
    renderConfigWritten({
      outcome: 'created',
      hasToken: Boolean(token),
      addedDevices: DEFAULT_DEVICES,
    })
  );

  return {
    createdConfig: config,
    hasAddedDefaultDevices: true,
  };
}

export default createConfig;
