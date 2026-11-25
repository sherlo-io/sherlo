import { readFile } from 'fs/promises';
import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { throwError } from '../../../helpers';
import { renderInvalidJson } from '../../../render/initFixes';
import { InvalidatedConfig } from '../../../types';
import getConfigPath from './getConfigPath';

async function readConfig(): Promise<InvalidatedConfig> {
  const configText = await readFile(getConfigPath(), 'utf-8');

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
