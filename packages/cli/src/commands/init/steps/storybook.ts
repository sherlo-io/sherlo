/**
 * STEP 5 - STORYBOOK. A project that has it keeps it as it is. One that has none gets Storybook's
 * lite setup: no heavy native library. Storybook's own installer has no lite option, so setup does
 * not run it (init-for-agents decision 2): it adds Storybook's packages itself with the project's
 * package manager, each at the version Sherlo tested, and writes `.rnstorybook` - with the example
 * stories the first test photographs until the project has stories of its own - from templates kept
 * in the CLI.
 *
 * Its line names the package and version, as Sherlo's line does. It does not say "lite": that changes
 * nothing anyone does next, and the stories guide and `.rnstorybook/index.ts` say it where it matters.
 */
import { detect } from 'package-manager-detector';
import { STORYBOOK_REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { getCwd, spinner as createSpinner, throwError } from '../../../helpers';
import { renderStorybookInstallFailed } from '../../../render/initFixes';
import { renderFailedStepLine, renderStepLine } from '../../../render/initSteps';
import { type InstallFailure, workstation } from '../../../seams/workstation';
import { addCommand } from '../dependencies/installSherlo';
import { printLines } from '../helpers';
import getPackageVersion from '../requirements/getPackageVersion';

/** Storybook's packages, each at the version Sherlo tested - never `@latest` at run time. */
export const STORYBOOK_VERSIONS = {
  '@storybook/react-native': '10.7.2',
  '@storybook/react-native-ui-lite': '10.7.2',
  storybook: '10.6.8',
};

/** Answers whether this run installed Storybook, which decides the example-stories next step. */
async function storybook({
  hasStorybook,
}: {
  hasStorybook: boolean;
}): Promise<{ installedNow: boolean }> {
  // A project's own Storybook prints no line: "Installed Storybook" would read as if setup had
  // installed or changed it.
  if (hasStorybook) {
    return { installedNow: false };
  }

  const projectRoot = getCwd();
  const tool = (await detect({ cwd: projectRoot }))?.agent ?? 'npm';
  const command = addCommand(
    tool,
    Object.entries(STORYBOOK_VERSIONS).map(([name, version]) => `${name}@${version}`)
  );

  // The longest step: a spinner in a terminal, and one line for an agent reading a pipe, so neither
  // takes the wait for a hang.
  const spinner = createSpinner('Installing Storybook...').start();

  let updatedPnpmSettings = false;
  try {
    // Only `--json` lets Yarn 2+ tell an error from a warning (../../../render/installOutput).
    ({ updatedPnpmSettings } = await workstation().installStorybook({
      command: tool === 'yarn@berry' ? `${command} --json` : command,
      projectRoot,
    }));
  } catch (error) {
    spinner.stop();
    printLines(renderFailedStepLine('Installing Storybook failed'));

    // THE FIX LINE KEEPS THE VERSIONS, unlike Sherlo's: Storybook's latest is not the one Sherlo
    // tested, and the three packages do not share one version.
    const { output, logFile } = error as InstallFailure;
    throwError({
      ...renderStorybookInstallFailed({
        command,
        tool,
        output,
        logFile,
      }),
      errorToReport: error as Error,
    });
  }

  spinner.stop();
  printLines([
    renderStepLine({
      outcome: 'done',
      name: 'Installed Storybook',
      detail: `${STORYBOOK_REACT_NATIVE_PACKAGE_NAME} ${getPackageVersion(
        STORYBOOK_REACT_NATIVE_PACKAGE_NAME
      )}`,
    }),
    // A file of the person's that setup changed is named, as metro.config.js is.
    ...(updatedPnpmSettings
      ? [
          renderStepLine({
            outcome: 'done',
            name: 'Updated pnpm settings',
            detail: 'pnpm-workspace.yaml',
          }),
        ]
      : []),
  ]);

  return { installedNow: true };
}

export default storybook;
