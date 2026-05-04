import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { FULL_INIT_COMMAND } from '../../../constants';
import { throwError } from '../../../helpers';
import getMetroConfigPath from '../metroConfig/getMetroConfigPath';

async function validateHasWithStorybookInMetroConfig(): Promise<void> {
  const configPath = getMetroConfigPath();

  if (!configPath) {
    throwError({
      message: 'No metro.config.js found in your project',
      learnMoreLink: 'https://github.com/storybookjs/react-native#setup',
      below:
        '\n' +
        chalk.reset('Create one and integrate Storybook (see link above).\n') +
        chalk.reset('Then re-run:\n') +
        chalk.cyan(`  ${FULL_INIT_COMMAND}`),
    });
    return;
  }

  const content = await fs.promises.readFile(configPath, 'utf-8');

  if (!content.includes('withStorybook(')) {
    throwError({
      message: `Found ${path.basename(configPath)} but it does not call withStorybook(...)`,
      learnMoreLink: 'https://github.com/storybookjs/react-native#setup',
      below:
        '\n' +
        chalk.reset('Add the withStorybook wrap from @storybook/react-native (see link above).\n') +
        chalk.reset('Then re-run:\n') +
        chalk.cyan(`  ${FULL_INIT_COMMAND}`),
    });
  }
}

export default validateHasWithStorybookInMetroConfig;
