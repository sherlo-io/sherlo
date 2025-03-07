import { existsSync } from 'fs';
import getEasJsonPath from './getEasJsonPath';

function hasEasJsonFile(): boolean {
  const easJsonPath = getEasJsonPath();

  return existsSync(easJsonPath);
}

export default hasEasJsonFile;
