import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { detect, resolveCommand } from 'package-manager-detector';
import { join } from 'path';
import { version as cliVersion } from '../../../../package.json';
import { FULL_INIT_COMMAND, SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';
import {
  getCwd,
  getErrorWithCustomMessage,
  spinner as createSpinner,
  throwError,
} from '../../../helpers';
import { workstation } from '../../../seams/workstation';
import getFailedCommandOutput from './getFailedCommandOutput';

async function installSherlo(): Promise<void> {
  const spinner = createSpinner('Installing Sherlo').start();

  let packageJson;
  const packageJsonPath = join(getCwd(), 'package.json');
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
  } catch (error) {
    spinner.fail();

    console.log();

    throwError({
      type: 'unexpected',
      error: getErrorWithCustomMessage(error, `Invalid ${packageJsonPath}`),
    });
  }

  // An SDK the app already depends on is kept as it is, whatever its spec (a version, file:, link:,
  // workspace:): a pinned or local SDK is the app's own choice, and installing over it would move
  // the app off the version it chose.
  if (
    packageJson.dependencies?.[SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME] ||
    packageJson.devDependencies?.[SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME]
  ) {
    spinner.succeed('Sherlo is already installed');
    return;
  }

  const packageSpec = sherloSdkPackageSpec(
    process.env.SHERLO_SDK_PATH,
    process.env.SHERLO_SDK_VERSION
  );

  // Detected FROM THE PROJECT, not from wherever the process happens to be standing - the project
  // is what the manager will be run in, and it is what a pose lays out in `files`.
  const packageManager = (await detect({ cwd: getCwd() }))?.name ?? 'npm';
  const resolvedCommand = resolveCommand(packageManager, 'add', [packageSpec]);

  if (!resolvedCommand) {
    spinner.fail();

    console.log();

    throwError({
      type: 'unexpected',
      error: new Error(`Failed to resolve command for package manager: ${packageManager}`),
    });
  }

  const { command, args } = resolvedCommand;
  const commandToRun = `${command} ${args.join(' ')}`;

  try {
    // Through the workstation seam - the one place `sherlo init` acts on the machine it runs on -
    // so a posed run answers the install from its `workstation` and never starts a real manager.
    await workstation().addPackage({
      packageSpec,
      command: commandToRun,
      projectRoot: getCwd(),
      env: packageManager === 'yarn' ? { YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' } : undefined,
    });
  } catch (error) {
    spinner.fail();

    console.log();

    throwError({
      message:
        'Failed to install Sherlo automatically\n' +
        '\n' +
        chalk.reset('Please install it manually:\n') +
        chalk.cyan(`  ${commandToRun}\n`) +
        '\n' +
        chalk.reset('Then re-run:\n') +
        chalk.cyan(`  ${FULL_INIT_COMMAND}`),
      below: getFailedCommandOutput(error),
      errorToReport: error,
    });
  }

  spinner.succeed('Installed Sherlo');
}

/**
 * The SDK a new install asks the package manager for. SHERLO_SDK_PATH (set e.g. by sherlo-tester)
 * installs from local source: a .tgz through file: (a real copy into node_modules, which Metro and
 * EAS need to resolve it), a directory through portal: (a symlink, for directory-based dev
 * iteration). SHERLO_SDK_VERSION names a published version. Otherwise it is the SDK version this
 * CLI ships with, so the two always match.
 */
export function sherloSdkPackageSpec(
  localSdkPath: string | undefined,
  sdkVersion: string | undefined
): string {
  if (localSdkPath) {
    const localSdkProtocol = localSdkPath.endsWith('.tgz') ? 'file' : 'portal';
    return `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}@${localSdkProtocol}:${localSdkPath}`;
  }

  return `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}@${sdkVersion || cliVersion}`;
}

export default installSherlo;
