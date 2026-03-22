import chalk from 'chalk';
import ora from 'ora';
import { FULL_INIT_COMMAND } from '../../../constants';
import { getCwd, runShellCommand, throwError } from '../../../helpers';
import { IOS_DIR } from './constants';

async function installPods(): Promise<void> {
  const spinner = ora('Installing Pods').start();

  const command = `cd ${IOS_DIR} && pod install`;

  try {
    await runShellCommand({
      command,
      projectRoot: getCwd(),
    });
  } catch (error) {
    spinner.fail();

    console.log();

    throwError({
      message:
        'Failed to install Pods automatically\n' +
        '\n' +
        chalk.reset('Please install them manually:\n') +
        chalk.cyan(`  ${command}\n`) +
        '\n' +
        chalk.reset('Then re-run:\n') +
        chalk.cyan(`  ${FULL_INIT_COMMAND}`),
      errorToReport: error,
    });
  }

  spinner.succeed('Installed Pods');
}

export default installPods;
