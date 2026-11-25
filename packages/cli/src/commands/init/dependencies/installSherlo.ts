import { readFile } from 'fs/promises';
import { type Agent, detect, resolveCommand } from 'package-manager-detector';
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
import { type InstallFailure, workstation } from '../../../seams/workstation';
import { printLines } from '../helpers';

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

  // An SDK the app already depends on (the step before this one left it alone when it is at this
  // tool's version) is at another version: it gets this tool's version, and the line says Updated.
  const hadSdk = Boolean(
    packageJson.dependencies?.[SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME] ??
    packageJson.devDependencies?.[SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME]
  );

  const packageSpec = sherloSdkPackageSpec(
    process.env.SHERLO_SDK_PATH,
    process.env.SHERLO_SDK_VERSION
  );

  // Detected FROM THE PROJECT, not from wherever the process happens to be standing - the project
  // is what the manager will be run in, and it is what a pose lays out in `files`.
  const tool = (await detect({ cwd: getCwd() }))?.agent ?? 'npm';
  const commandToRun = addCommand(tool, [packageSpec]);

  try {
    // Through the workstation seam - the one place `sherlo init` acts on the machine it runs on -
    // so a posed run answers the install from its `workstation` and never starts a real manager.
    await workstation().addPackage({
      packageSpec,
      // Only `--json` lets Yarn 2+ tell an error from a warning (../../../render/installOutput).
      command: tool === 'yarn@berry' ? `${commandToRun} --json` : commandToRun,
      projectRoot: getCwd(),
      env: tool.startsWith('yarn') ? { YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' } : undefined,
    });
  } catch (error) {
    spinner.stop();
    printLines(renderFailedStepLine('Installing Sherlo failed'));

    // The fix line names the package with no version: a version that failed to download fails
    // again when copied, and the bare name installs the newest.
    const { output, logFile } = error as InstallFailure;
    throwError({
      ...renderInstallFailed({
        command: addCommand(tool, [SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME]),
        tool,
        output,
        logFile,
      }),
      errorToReport: error,
    });
  }

  spinner.stop();
  printLines([
    renderStepLine({
      outcome: 'done',
      name: hadSdk ? 'Updated Sherlo' : 'Installed Sherlo',
      detail: `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME} ${cliVersion}`,
    }),
  ]);
}

/** The package manager's own `add` command line for these packages, as a person types it. */
export function addCommand(tool: Agent, packageSpecs: string[]): string {
  // `add` resolves for every manager package-manager-detector knows.
  const { command, args } = resolveCommand(tool, 'add', packageSpecs)!;
  return `${command} ${args.join(' ')}`;
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
