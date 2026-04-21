import fs from 'fs';
import { ALREADY_WRAPPED_TOKEN, WITH_STORYBOOK_TOKEN } from './constants';
import getMetroConfigPath from './getMetroConfigPath';

interface MetroConfigState {
  path: string | null;
  content: string | null;
  alreadyWrapped: boolean;
  hasWithStorybook: boolean;
  quoteChar: '"' | "'";
}

async function readMetroConfigState(): Promise<MetroConfigState> {
  const configPath = getMetroConfigPath();

  if (!configPath) {
    return { path: null, content: null, alreadyWrapped: false, hasWithStorybook: false, quoteChar: "'" };
  }

  const content = await fs.promises.readFile(configPath, 'utf-8');
  const alreadyWrapped = content.includes(ALREADY_WRAPPED_TOKEN);
  const hasWithStorybook = content.includes(WITH_STORYBOOK_TOKEN);
  const quoteChar = content.includes('"') ? '"' : "'";

  return { path: configPath, content, alreadyWrapped, hasWithStorybook, quoteChar };
}

export default readMetroConfigState;
