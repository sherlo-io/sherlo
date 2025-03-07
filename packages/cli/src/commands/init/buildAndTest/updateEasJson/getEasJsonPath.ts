import { join } from 'path';
import { getCwd } from '../../helpers';
import { EAS_JSON_FILENAME } from './constants';

function getEasJsonPath(): string {
  const cwd = getCwd();

  return join(cwd, EAS_JSON_FILENAME);
}

export default getEasJsonPath;
