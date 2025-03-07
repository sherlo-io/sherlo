import { readFile } from 'fs/promises';
import { throwError } from '../../../../helpers';
import getEasJsonPath from './getEasJsonPath';

async function readEasJson(): Promise<Record<string, any>> {
  const easJsonPath = getEasJsonPath();

  let content;
  try {
    content = await readFile(easJsonPath, 'utf-8');
  } catch (error) {
    throwError({ type: 'unexpected', error });
  }

  let parsedContent: Record<string, any>;
  try {
    parsedContent = JSON.parse(content);
  } catch {
    parsedContent = {}; // Return empty config if file exists but is invalid JSON
  }

  return parsedContent;
}

export default readEasJson;
