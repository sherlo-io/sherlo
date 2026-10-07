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
import { version as cliVersion } from '../../../../package.json';
import { renderFailedStepLine, renderStepLine } from '../../../render/initSteps';
import { workstation } from '../../../seams/workstation';
import { printLines } from '../helpers';
import getFailedCommandOutput from './getFailedCommandOutput';

async function installSherlo(): Promise<void> {
  const spinner = createSpinner('Installing Sherlo (this can take a minute)').start();

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
    spinner.stop();
    printLines(renderFailedStepLine('Installing Sherlo failed'));

    // BUILD DEBT (init-for-agents): the tool's marked error lines and the full log file, by the rule
    // the plan settled, in place of the last lines of each stream.
    throwError({
      message: `${packageManager} could not install ${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}`,
      below:
        (getFailedCommandOutput(error) ?? '') +
        '\n\n' +
        chalk.reset('Fix the error above, or install it yourself:\n') +
        chalk.cyan(`  ${commandToRun}\n`) +
        '\n' +
        chalk.reset('Then re-run setup. It picks up where it stopped:\n') +
        chalk.cyan(`  ${FULL_INIT_COMMAND}`),
      errorToReport: error,
    });
  }

  spinner.stop();
  printLines([
    renderStepLine({
      outcome: 'done',
      name: 'Installed Sherlo',
      detail: `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME} ${cliVersion}`,
    }),
  ]);
}

export default installSherlo;
