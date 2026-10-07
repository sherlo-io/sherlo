/**
 * STEP 5 - STORYBOOK. A project that has it keeps it as it is. One that has none gets it from
 * Storybook's own installer, which also writes its example stories - the stories the first test
 * photographs until the project has stories of its own.
 *
 * OPEN DECISION (spike): whether the installer runs with no questions on every app Sherlo supports.
 */
import { detect, resolveCommand } from 'package-manager-detector';
import { getCwd, spinner as createSpinner, throwError } from '../../../helpers';
import { renderFailedStepLine, renderStepLine } from '../../../render/initSteps';
import { workstation } from '../../../seams/workstation';
import getFailedCommandOutput from '../dependencies/getFailedCommandOutput';
import { printLines } from '../helpers';

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
    renderStepLine({ outcome: 'done', name: 'Installed Storybook', detail: "with Storybook's example stories" }),
  ]);

  return { installedNow: true };
}

export default storybook;
