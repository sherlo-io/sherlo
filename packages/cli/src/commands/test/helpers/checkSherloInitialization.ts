import chalk from 'chalk';
import { existsSync } from 'fs';
import path from 'path';
import {
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_PROJECT_ROOT,
  FULL_INIT_COMMAND,
} from '../../../constants';
import { throwError } from '../../../helpers';

/**
 * Check if Sherlo is initialized in the project
 * Returns true if config file exists
 */
async function checkSherloInitialization(options?: {
  projectRoot?: string;
  config?: string;
}): Promise<void> {
  const projectRoot = options?.projectRoot ?? DEFAULT_PROJECT_ROOT;
  const configFilename = options?.config ?? DEFAULT_CONFIG_FILENAME;

  const configPath = path.resolve(projectRoot, configFilename);
  const configExists = existsSync(configPath);

  if (!configExists) {
    throwError({
      message:
        'Sherlo config file not found' +
        chalk.reset.dim(` (${configPath})\n`) +
        '\n' +
        chalk.reset('To initialize Sherlo run:\n') +
        chalk.cyan(`  ${FULL_INIT_COMMAND}`),
    });
  }
}

export default checkSherloInitialization;
