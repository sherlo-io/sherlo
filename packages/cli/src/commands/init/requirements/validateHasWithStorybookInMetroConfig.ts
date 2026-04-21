import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { FULL_INIT_COMMAND } from '../../../constants';
import { getCwd, throwError } from '../../../helpers';

const METRO_CONFIG_NAMES = [
  'metro.config.js',
  'metro.config.ts',
  'metro.config.cjs',
  'metro.config.mjs',
];

async function validateHasWithStorybookInMetroConfig(): Promise<void> {
  const cwd = getCwd();

  let configPath: string | null = null;
  for (const name of METRO_CONFIG_NAMES) {
    const full = path.join(cwd, name);
    if (fs.existsSync(full)) {
      configPath = full;
      break;
    }
  }

  if (!configPath) {
    throwError({
      message: 'Set up Storybook integration in metro.config.js before initializing Sherlo',
      learnMoreLink: 'https://github.com/storybookjs/react-native#setup',
      below: '\n' + chalk.reset('Then re-run:\n') + chalk.cyan(`  ${FULL_INIT_COMMAND}`),
    });
    return;
  }

  const content = await fs.promises.readFile(configPath, 'utf-8');

  if (!content.includes('withStorybook(')) {
    throwError({
      message: 'Set up Storybook integration in metro.config.js before initializing Sherlo',
      learnMoreLink: 'https://github.com/storybookjs/react-native#setup',
      below: '\n' + chalk.reset('Then re-run:\n') + chalk.cyan(`  ${FULL_INIT_COMMAND}`),
    });
  }
}

export default validateHasWithStorybookInMetroConfig;
