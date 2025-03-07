import { readFile } from 'fs/promises';
import { throwError } from '../../../helpers';
import { InvalidatedConfig } from '../../../types';
import getConfigPath from './getConfigPath';

async function readConfig(): Promise<InvalidatedConfig> {
  const configPath = getConfigPath();

  let content;
  try {
    content = await readFile(configPath, 'utf-8');
  } catch (error) {
    throwError({ type: 'unexpected', error });
  }

  let parsedContent: InvalidatedConfig;
  try {
    parsedContent = JSON.parse(content);
  } catch {
    parsedContent = {}; // Return empty config if file exists but is invalid JSON
  }

  return parsedContent;
}

export default readConfig;
