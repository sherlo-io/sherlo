import { readFile } from 'fs/promises';
import { detect, resolveCommand } from 'package-manager-detector';
import { join } from 'path';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';
import {
  getCwd,
  getErrorWithCustomMessage,
  spinner as createSpinner,
  throwError,
} from '../../../helpers';
import { version as cliVersion } from '../../../../package.json';
import { renderInstallFailed } from '../../../render/initFixes';
import { renderFailedStepLine, renderStepLine } from '../../../render/initSteps';
import { workstation } from '../../../seams/workstation';
import { printLines } from '../helpers';
import getFailedCommandOutput from './getFailedCommandOutput';

async function installSherlo(): Promise<void> {
  const spinner = createSpinner('Installing Sherlo...').start();

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
  const existingSdkSpec: string | undefined =
    packageJson.dependencies?.[SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME] ??
    packageJson.devDependencies?.[SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME];
  if (existingSdkSpec) {
    spinner.stop();
    printLines([
      renderStepLine({
        outcome: 'already',
        name: 'Installed Sherlo',
        detail: `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME} ${existingSdkSpec}`,
      }),
    ]);
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
    spinner.stop();
    printLines(renderFailedStepLine('Installing Sherlo failed'));

    // BUILD DEBT (init-for-agents): the tool's marked error lines and the full log file, by the rule
    // the plan settled, in place of the last lines of each stream.
    throwError({
      ...renderInstallFailed({
        installing: 'Sherlo',
        command: commandToRun,
        failedOutput: getFailedCommandOutput(error),
      }),
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
