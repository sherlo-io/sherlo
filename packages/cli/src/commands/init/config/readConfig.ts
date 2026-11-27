import { readFile } from 'fs/promises';
import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { throwError } from '../../../helpers';
import { renderInvalidJson } from '../../../render/initFixes';
import { InvalidatedConfig } from '../../../types';
import refuseFileAccess from '../helpers/refuseFileAccess';
import getConfigPath from './getConfigPath';

/**
 * The first read is the app check's, which marks its own step red: a config setup can't read or
 * parse stops the run there, before anything is logged in, made or installed.
 */
async function readConfig(): Promise<InvalidatedConfig> {
  const configPath = getConfigPath();

  let configText: string;
  try {
    configText = await readFile(configPath, 'utf-8');
  } catch (error) {
    refuseFileAccess({ failedStep: null, access: 'read', file: configPath, error });
  }

  let sherloConfig: InvalidatedConfig;
  try {
    sherloConfig = JSON.parse(configText);
  } catch (error) {
    // The person's own file is at fault, not Sherlo: the parser's line and column, never a bug report.
    throwError(
      renderInvalidJson({ path: DEFAULT_CONFIG_FILENAME, reason: (error as Error).message })
    );
  }

  return sherloConfig;
}

export default readConfig;
