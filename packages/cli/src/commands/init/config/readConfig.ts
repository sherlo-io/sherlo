import { readFile } from 'fs/promises';
import { getErrorWithCustomMessage, throwError } from '../../../helpers';
import { InvalidatedConfig } from '../../../types';
import getConfigPath from './getConfigPath';

async function readConfig(): Promise<InvalidatedConfig> {
  const configPath = getConfigPath();

  let sherloConfig: InvalidatedConfig;
  try {
    sherloConfig = JSON.parse(await readFile(configPath, 'utf-8'));
  } catch (error) {
    throwError({
      type: 'unexpected',
      error: getErrorWithCustomMessage(error, `Invalid ${configPath}`),
    });
  }

  return sherloConfig;
}

export default readConfig;
