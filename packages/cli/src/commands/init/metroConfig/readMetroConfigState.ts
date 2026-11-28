import fs from 'fs';
import getMetroConfigPath from './getMetroConfigPath';
import readMetroConfigCode from './readMetroConfigCode';

interface MetroConfigState {
  path: string | null;
  content: string | null;
  /** Read from the parsed code: a comment naming Sherlo's package is not a wiring. */
  alreadyWrapped: boolean;
}

async function readMetroConfigState(): Promise<MetroConfigState> {
  const configPath = getMetroConfigPath();

  if (!configPath) {
    return { path: null, content: null, alreadyWrapped: false };
  }

  const content = await fs.promises.readFile(configPath, 'utf-8');
  const alreadyWrapped = readMetroConfigCode(content)?.wiredForSherlo ?? false;

  return { path: configPath, content, alreadyWrapped };
}

export default readMetroConfigState;
