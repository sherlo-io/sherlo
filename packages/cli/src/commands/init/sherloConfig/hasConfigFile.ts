import { existsSync } from 'fs';
import getConfigPath from './getConfigPath';

function hasConfigFile(): boolean {
  const configPath = getConfigPath();

  return existsSync(configPath);
}

export default hasConfigFile;
