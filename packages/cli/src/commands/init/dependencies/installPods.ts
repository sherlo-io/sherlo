import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { FULL_INIT_COMMAND } from '../../../constants';
import { getCwd, spinner as createSpinner, throwError } from '../../../helpers';
import { workstation } from '../../../seams/workstation';
import { IOS_DIR } from './constants';
import getFailedCommandOutput from './getFailedCommandOutput';

async function installPods(): Promise<void> {
  const spinner = createSpinner('Installing Pods').start();

  if (workstation().podsAreCurrent()) {
    spinner.succeed('Pods are current, install skipped');
    return;
  }

  // a Gemfile that names cocoapods means the pods install through Bundler.
  const throughBundler = aGemfileNamesCocoapods(getCwd());
  const command = `cd ${IOS_DIR} && ${throughBundler ? 'bundle exec ' : ''}pod install`;

  try {
    // Through the workstation seam, like the package install, so a posed run answers it from its
    // `workstation` and never starts a real `pod install`.
    await workstation().installPods({
      command,
      projectRoot: getCwd(),
      sherloBuildUnset: true,
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
      below: getFailedCommandOutput(error),
      errorToReport: error,
    });
  }

  spinner.succeed(throughBundler ? 'Installed Pods (bundle exec pod install)' : 'Installed Pods');
}

/** whether the project's Gemfile, at its root or in ios/, names cocoapods. */
function aGemfileNamesCocoapods(projectRoot: string): boolean {
  return [path.join(projectRoot, 'Gemfile'), path.join(projectRoot, IOS_DIR, 'Gemfile')].some(
    (gemfile) => fs.existsSync(gemfile) && /cocoapods/.test(fs.readFileSync(gemfile, 'utf8'))
  );
}

export default installPods;
