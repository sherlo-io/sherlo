import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { detect, resolveCommand } from 'package-manager-detector';
import { join } from 'path';
import { FULL_INIT_COMMAND, SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';
import {
  getCwd,
  getErrorWithCustomMessage,
  spinner as createSpinner,
  throwError,
} from '../../../helpers';
import { workstation } from '../../../seams/workstation';

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

  const isSherloAlreadyInDevDependencies =
    !!packageJson.devDependencies?.[SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME];

  // When SHERLO_SDK_PATH is set (e.g. by sherlo-tester), install from local source.
  // .tgz → file: (real copy into node_modules, required for Metro/EAS symlink resolution)
  // directory → portal: (symlink, back-compat for directory-based dev iteration)
  const localSdkPath = process.env.SHERLO_SDK_PATH;
  const sdkVersion = process.env.SHERLO_SDK_VERSION;
  const localSdkProtocol = localSdkPath?.endsWith('.tgz') ? 'file' : 'portal';
  const packageSpec = localSdkPath
    ? `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}@${localSdkProtocol}:${localSdkPath}`
    : sdkVersion
    ? `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}@${sdkVersion}`
    : SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME;

  // Detected FROM THE PROJECT, not from wherever the process happens to be standing - the project
  // is what the manager will be run in, and it is what a pose lays out in `files`.
  const packageManager = (await detect({ cwd: getCwd() }))?.name ?? 'npm';
  const resolvedCommand = resolveCommand(
    packageManager,
    'add',
    [isSherloAlreadyInDevDependencies ? '-D' : null, packageSpec].filter(Boolean) as string[]
  );

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
      errorToReport: error,
    });
  }

  spinner.succeed('Installed Sherlo');
}

export default installSherlo;
