import { readFile } from 'fs/promises';
import { getEnhancedError, throwError } from '../../../helpers';
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
      error: getEnhancedError(`Invalid ${configPath}`, error),
    });
  }

  return sherloConfig;
}

export default readConfig;
