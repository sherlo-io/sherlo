import { writeFile } from 'fs/promises';
import { InvalidatedConfig } from '../../../types';
import getConfigPath from './getConfigPath';

/** A write the system refuses throws its own error: the caller names the step that stopped. */
async function writeConfig(config: InvalidatedConfig): Promise<void> {
  await writeFile(getConfigPath(), JSON.stringify(config, null, 2));
}

export default writeConfig;
