import { renderConfigWritten } from '../../../render/initConfig';
import { InvalidatedConfig } from '../../../types';
import { printLines } from '../helpers';
import { DEFAULT_DEVICES } from './constants';
import readConfig from './readConfig';
import writeConfig from './writeConfig';

/**
 * An existing config, written back with its keys and devices, the default devices only when it has
 * none, and the project in place of the old one. A `token` an older setup wrote stays as it was;
 * setup never writes one.
 */
async function updateConfig(
  project: string
): Promise<{ updatedConfig: InvalidatedConfig; hasAddedDefaultDevices: boolean }> {
  const config = await readConfig();
  const hasDevices = Array.isArray(config.devices) && config.devices.length > 0;
  const hasAddedDefaultDevices = !hasDevices;

  const updatedConfig = {
    ...config,
    project,
    devices: hasDevices ? config.devices : DEFAULT_DEVICES,
  };

  await writeConfig(updatedConfig);

  printLines(
    renderConfigWritten({
      outcome: 'already-created',
      project,
      addedDevices: hasAddedDefaultDevices ? DEFAULT_DEVICES : [],
    })
  );

  return {
    updatedConfig,
    hasAddedDefaultDevices,
  };
}

export default updateConfig;
