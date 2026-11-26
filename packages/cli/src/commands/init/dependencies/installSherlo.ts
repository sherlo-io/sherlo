import { readFile } from 'fs/promises';
import { type Agent, detect, resolveCommand } from 'package-manager-detector';
import { join } from 'path';
import {
  SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
} from '../../../constants';
import {
  getCwd,
  getErrorWithCustomMessage,
  spinner as createSpinner,
  throwError,
} from '../../../helpers';
import { version as cliVersion } from '../../../../package.json';
import { renderInstallFailed, renderStorybookPinsExactVersions } from '../../../render/initFixes';
import { renderFailedStepLine, renderStepLine } from '../../../render/initSteps';
import { type InstallFailure, workstation } from '../../../seams/workstation';
import { printLines } from '../helpers';
import getPackageVersion from '../requirements/getPackageVersion';
import storybookUpgrade from '../requirements/storybookUpgrade';

/**
 * Storybook for React Native 10.5.2 to 10.6.1 demand these peers at one exact version each
 * (react-native-safe-area-context 5.8.0, react-native-reanimated 4.5.1, per `npm view`); 10.6.2
 * made them loose again.
 */
const STORYBOOK_EXACT_PEERS = ['react-native-safe-area-context', 'react-native-reanimated'];

export function storybookPinsExactPeers(version: string): boolean {
  // A prerelease tag after the patch number is not read.
  const [major, minor, patch] = version.split(/[.-]/).map(Number);
  const isAtLeast10_5_2 = major === 10 && (minor > 5 || (minor === 5 && patch >= 2));
  const isAtMost10_6_1 = major === 10 && (minor < 6 || (minor === 6 && patch <= 1));
  return isAtLeast10_5_2 && isAtMost10_6_1;
}

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
  // tool's version) is at another version: it gets the newest its range allows, and the line says
  // Updated.
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

    const { output, logFile } = error as InstallFailure;

    // npm alone refuses a peer it cannot meet (Yarn, pnpm and Bun warn and go on), so only npm
    // stops on the exact versions these Storybook releases demand, and installing Sherlo again would
    // stop the same way: the way out is Storybook's.
    const storybookVersion = getPackageVersion(STORYBOOK_REACT_NATIVE_PACKAGE_NAME);
    if (
      tool === 'npm' &&
      storybookVersion !== null &&
      storybookPinsExactPeers(storybookVersion) &&
      output.includes('ERESOLVE') &&
      STORYBOOK_EXACT_PEERS.some((peer) => output.includes(peer))
    ) {
      throwError({
        ...renderStorybookPinsExactVersions({
          current: storybookVersion,
          pinnedPackages: STORYBOOK_EXACT_PEERS,
          upgrade: await storybookUpgrade(),
          reader: process.stdout.isTTY ? 'person' : 'agent',
        }),
        errorToReport: error,
      });
    }

    // The fix line names the same package the install asked for, so the person's retry gets what
    // setup would have installed.
    throwError({
      ...renderInstallFailed({
        command: commandToRun,
        tool,
        output,
        logFile,
      }),
      errorToReport: error,
    });
  }

  // The version the manager actually chose, read back from node_modules: on the day this CLI's
  // version comes out, Yarn 4 refuses a version under a day old and installs the one before it.
  // A project with no node_modules (Yarn Plug'n'Play) has nothing to read, so the line names the
  // range that was asked for.
  const installedVersion =
    getPackageVersion(SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME) ??
    packageSpec.slice(SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME.length + 1);

  spinner.stop();
  printLines([
    renderStepLine({
      outcome: 'done',
      name: hadSdk ? 'Updated Sherlo' : 'Installed Sherlo',
      detail: `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME} ${installedVersion}`,
    }),
  ]);
}

/** The package manager's own `add` command line for these packages, as a person types it. */
export function addCommand(tool: Agent, packageSpecs: string[]): string {
  return managerCommand(tool, 'add', packageSpecs);
}

/** The package manager's own line adding or removing these packages, as a person types it. */
export function managerCommand(
  tool: Agent,
  intent: 'add' | 'uninstall',
  packageSpecs: string[]
): string {
  // `add` and `uninstall` resolve for every manager package-manager-detector knows.
  const { command, args } = resolveCommand(tool, intent, packageSpecs)!;
  return `${command} ${args.join(' ')}`;
}

/**
 * The SDK a new install asks the package manager for. SHERLO_SDK_PATH (set e.g. by sherlo-tester)
 * installs from local source: a .tgz through file: (a real copy into node_modules, which Metro and
 * EAS need to resolve it), a directory through portal: (a symlink, for directory-based dev
 * iteration). SHERLO_SDK_VERSION names a published version. Otherwise it is a range on this CLI's
 * major version (`^3`), never the exact version: Yarn 4 refuses a version under a day old when it
 * is named exactly (YN0016), while from a range every manager takes the newest it allows.
 */
export function sherloSdkPackageSpec(
  localSdkPath: string | undefined,
  sdkVersion: string | undefined
): string {
  if (localSdkPath) {
    const localSdkProtocol = localSdkPath.endsWith('.tgz') ? 'file' : 'portal';
    return `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}@${localSdkProtocol}:${localSdkPath}`;
  }

  return `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}@${sdkVersion || `^${cliVersion.split('.')[0]}`}`;
}

export default installSherlo;
