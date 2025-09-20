import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import { BRANCH_OPTION } from '../../../constants';
import { throwError } from '../../../helpers';

async function collectExpoUpdateOptions(): Promise<Record<string, string | boolean>> {
  console.log();

  let easUpdateBranchName;
  try {
    easUpdateBranchName = await input({
      message: `Enter EAS Update branch name${chalk.reset.dim(` (--${BRANCH_OPTION})`)}:`,
      validate: (value: string) => (value.length > 0 ? true : 'Branch name is required'),
    });
  } catch (error: any) {
    console.log();

    if (error.name === 'ExitPromptError') {
      throwError({ message: 'No EAS Update branch name provided' });
    }

    throw error;
  }

  return { [BRANCH_OPTION]: easUpdateBranchName };
}

export default collectExpoUpdateOptions;
