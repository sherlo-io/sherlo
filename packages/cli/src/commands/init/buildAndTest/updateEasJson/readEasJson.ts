import { readFile } from 'fs/promises';
import { getEnhancedError, throwError } from '../../../../helpers';
import getEasJsonPath from './getEasJsonPath';

async function readEasJson(): Promise<Record<string, any>> {
  const easJsonPath = getEasJsonPath();

  let easJson: Record<string, any>;
  try {
    easJson = JSON.parse(await readFile(easJsonPath, 'utf-8'));
  } catch (error) {
    throwError({
      type: 'unexpected',
      error: getEnhancedError(`Invalid ${easJsonPath}`, error),
    });
  }

  return easJson;
}

export default readEasJson;
