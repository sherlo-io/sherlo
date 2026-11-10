import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { FULL_INIT_COMMAND } from '../../../constants';
import { getCwd, spinner as createSpinner, throwError } from '../../../helpers';
import { podInstallFailureLines } from '../../../seams/podTouchedFiles';
import { workstation } from '../../../seams/workstation';
import { IOS_DIR } from './constants';
import getFailedCommandOutput from './getFailedCommandOutput';

async function installPods(): Promise<void> {
  const spinner = createSpinner('Installing Pods').start();

  // Configurations are named by the app (DEV.DEBUG, UAT.RELEASE...), so Sherlo linked into any
  // configuration counts: pods already current and linked so need no install.
  if (workstation().podsAreCurrent(path.join(getCwd(), IOS_DIR))) {
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

    const { stdout, stderr, exitCode } = (error ?? {}) as {
      stdout?: unknown;
      stderr?: unknown;
      exitCode?: unknown;
    };
    const failureLines = podInstallFailureLines({
      command,
      exitCode: typeof exitCode === 'number' ? exitCode : undefined,
      logLines: [stdout, stderr]
        .filter((stream): stream is string => typeof stream === 'string')
        .flatMap((stream) => stream.split('\n')),
    });
    // Bundler failing on its own (a Ruby version or binstub mismatch) says nothing against `pod`.
    const bundlerFailed = throughBundler && /bundler/i.test(failureLines[1] ?? '');

    throwError({
      message:
        'Failed to install Pods automatically\n' +
        '\n' +
        chalk.reset(failureLines.join('\n') + '\n') +
        (bundlerFailed
          ? chalk.reset(
              `Bundler failed here, so plain \`pod install\` in ${IOS_DIR}/ may work instead.\n`
            )
          : '') +
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
