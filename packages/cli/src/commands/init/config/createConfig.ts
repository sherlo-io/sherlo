import { renderConfigWritten } from '../../../render/initConfig';
import { InvalidatedConfig } from '../../../types';
import { printLines } from '../helpers';
import { defaultDevicesFor } from './constants';
import writeConfig from './writeConfig';

/** A new config: the project and the default devices. Never a token - the file is committed. */
async function createConfig(
  project: string
): Promise<{ createdConfig: InvalidatedConfig; hasAddedDefaultDevices: boolean }> {
  const devices = defaultDevicesFor();
  const config = {
    project,
    devices,
  };

  await writeConfig(config);

  printLines(
    renderConfigWritten({
      outcome: 'created',
      project,
      addedDevices: devices,
    })
  );

  return {
    createdConfig: config,
    hasAddedDefaultDevices: true,
  };
}

export default createConfig;
