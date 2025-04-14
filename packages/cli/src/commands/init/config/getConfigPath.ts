import { join } from 'path';
import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { getCwd } from '../../../helpers';

function getConfigPath(): string {
  const cwd = getCwd();

  return join(cwd, DEFAULT_CONFIG_FILENAME);
}

export default getConfigPath;
