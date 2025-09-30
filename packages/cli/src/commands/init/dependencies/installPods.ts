import chalk from 'chalk';
import ora from 'ora';
import { FULL_INIT_COMMAND } from '../../../constants';
import { getCwd, runShellCommand, throwError } from '../../../helpers';
import { trackProgress } from '../helpers';
import { EVENT, IOS_DIR } from './constants';

async function installPods(sessionId: string): Promise<void> {
  const spinner = ora('Installing Pods').start();

  const event = `${EVENT}:installPods`;

  const command = `cd ${IOS_DIR} && pod install`;

  try {
    await runShellCommand({
      command,
      projectRoot: getCwd(),
    });
  } catch (error) {
    spinner.fail();

    console.log();

    await trackProgress({
      event,
      params: { status: 'failed:command_error' },
      sessionId,
    });

    throwError({
      message:
        'Failed to install Pods automatically\n' +
        '\n' +
        chalk.reset('Please install them manually:\n') +
        chalk.cyan(`  ${command}\n`) +
        '\n' +
        chalk.reset('Then re-run:\n') +
        chalk.cyan(`  ${FULL_INIT_COMMAND}\n`),
      errorToReport: error,
    });
  }

  spinner.succeed('Installed Pods');

  await trackProgress({
    event,
    params: { status: 'success' },
    sessionId,
  });
}

export default installPods;
