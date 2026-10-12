/**
 * STEP 5 - STORYBOOK. A project that has it keeps it as it is. One that has none gets Storybook's
 * lite setup (operator, 2026-10-12): one native library instead of eight. Storybook's own installer
 * cannot write it, so setup installs the packages and writes `.rnstorybook` from its own copy of
 * Storybook's files, with Storybook's example stories - the stories the first test photographs until
 * the project has stories of its own.
 *
 * Its line names the package and version, as Sherlo's line does, and says "(lite)", so whoever reads
 * Storybook's docs later knows why its phone browser looks different.
 */
import { detect, resolveCommand } from 'package-manager-detector';
import { STORYBOOK_REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { getCwd, spinner as createSpinner, throwError } from '../../../helpers';
import { renderFailedStepLine, renderStepLine } from '../../../render/initSteps';
import { workstation } from '../../../seams/workstation';
import getFailedCommandOutput from '../dependencies/getFailedCommandOutput';
import { printLines } from '../helpers';
import getPackageVersion from '../requirements/getPackageVersion';

/** Answers whether this run installed Storybook, which decides the example-stories next step. */
async function storybook({ hasStorybook }: { hasStorybook: boolean }): Promise<{ installedNow: boolean }> {
  // A project's own Storybook prints no line: "Installed Storybook (already done)" would read as if
  // setup had installed or changed it.
  if (hasStorybook) {
    return { installedNow: false };
  }

  const projectRoot = getCwd();
  const packageManager = (await detect({ cwd: projectRoot }))?.name ?? 'npm';
  const resolved = resolveCommand(packageManager, 'execute', [
    'create-storybook@latest',
    '--yes',
    '--type',
    'react_native',
    '--no-dev',
    '--disable-telemetry',
  ]);
  const command = resolved ? `${resolved.command} ${resolved.args.join(' ')}` : '';

  // The longest step: a spinner in a terminal, and one line for an agent reading a pipe, so neither
  // takes the wait for a hang.
  const spinner = createSpinner('Installing Storybook...').start();

  try {
    await workstation().installStorybook({ command, projectRoot });
  } catch (error) {
    spinner.stop();
    printLines(renderFailedStepLine('Installing Storybook failed'));

    throwError({
      message: 'Storybook could not be installed',
      below: getFailedCommandOutput(error),
      errorToReport: error as Error,
    });
  }

  spinner.stop();
  printLines([
    renderStepLine({
      outcome: 'done',
      name: 'Installed Storybook',
      detail: `${STORYBOOK_REACT_NATIVE_PACKAGE_NAME} ${getPackageVersion(STORYBOOK_REACT_NATIVE_PACKAGE_NAME)} (lite)`,
    }),
  ]);

  return { installedNow: true };
}

export default storybook;
