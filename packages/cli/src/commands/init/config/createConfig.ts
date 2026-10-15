import { renderConfigWritten } from '../../../render/initConfig';
import { InvalidatedConfig } from '../../../types';
import { printLines } from '../helpers';
import { DEFAULT_DEVICES } from './constants';
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

  printLines(
    renderConfigWritten({
      outcome: 'created',
      project,
      addedDevices: DEFAULT_DEVICES,
    })
  );

  return {
    createdConfig: config,
    hasAddedDefaultDevices: true,
  };
}

export default createConfig;
