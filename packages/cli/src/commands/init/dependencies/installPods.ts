import chalk from 'chalk';
import { FULL_INIT_COMMAND } from '../../../constants';
import { getCwd, spinner as createSpinner, throwError } from '../../../helpers';
import { workstation } from '../../../seams/workstation';
import { IOS_DIR } from './constants';

async function installPods(): Promise<void> {
  const spinner = createSpinner('Installing Pods').start();

  const command = `cd ${IOS_DIR} && pod install`;

  try {
    // Through the workstation seam, like the package install, so a posed run answers it from its
    // `workstation` and never starts a real `pod install`.
    await workstation().installPods({
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
