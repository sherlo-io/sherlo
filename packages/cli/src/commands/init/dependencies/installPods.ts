import chalk from 'chalk';
import { existsSync } from 'fs';
import ora from 'ora';
import { join } from 'path';
import { getCwd, logWarning, runShellCommand, throwError } from '../../../helpers';
import { trackProgress } from '../helpers';
import { EVENT } from './constants';

const IOS_DIR = 'ios';

async function installPods(sessionId: string): Promise<void> {
  const spinner = ora('Installing Pods').start();

  const event = `${EVENT}:installPods`;

  const iosDir = join(getCwd(), IOS_DIR);

  if (!existsSync(iosDir)) {
    spinner.fail();

    console.log();

    logWarning({
      message: 'Skipped Pods installation - iOS directory not found',
    });

    await trackProgress({
      event,
      params: { status: 'skipped:ios_dir_not_found' },
      sessionId,
    });

    return;
  }

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
        chalk.cyan('  ' + command),
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
