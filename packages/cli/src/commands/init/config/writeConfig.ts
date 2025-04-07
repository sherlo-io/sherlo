import { writeFile } from 'fs/promises';
import { throwError } from '../../../helpers';
import { InvalidatedConfig } from '../../../types';
import getConfigPath from './getConfigPath';

async function writeConfig(config: InvalidatedConfig): Promise<void> {
  const configPath = getConfigPath();

  try {
    await writeFile(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    throwError({ type: 'unexpected', error });
  }
}

export default writeConfig;
