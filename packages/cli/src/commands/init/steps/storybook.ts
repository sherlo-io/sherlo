/**
 * STEP 5 - STORYBOOK. A project that has it keeps it as it is. One that has none gets Storybook's
 * lite setup: no heavy native library. Storybook's own installer has no lite option, so setup runs it
 * with `--skip-install` (it writes `.rnstorybook` with Storybook's example stories - the stories the
 * first test photographs until the project has stories of its own - and lists its packages without
 * installing them), then converts what it wrote: crosses off the heavy native packages it added and
 * the controls addon (which needs a date picker and a slider), switches `.rnstorybook/index.ts` to the
 * lite UI and turns lite on in the bundler config, and installs once. Sherlo keeps no copy of
 * Storybook's files.
 *
 * Its line names the package and version, as Sherlo's line does. It does not say "lite": that changes
 * nothing anyone does next, and the stories guide and `.rnstorybook/index.ts` say it where it matters.
 */
import { detect, resolveCommand } from 'package-manager-detector';
import { STORYBOOK_REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { getCwd, spinner as createSpinner, throwError } from '../../../helpers';
import {
  renderStorybookDownloadFailed,
  renderStorybookInstallerFailed,
} from '../../../render/initFixes';
import { renderFailedStepLine, renderStepLine } from '../../../render/initSteps';
import { workstation } from '../../../seams/workstation';
import getFailedCommandOutput from '../dependencies/getFailedCommandOutput';
import { printLines } from '../helpers';
import getPackageVersion from '../requirements/getPackageVersion';

/** Answers whether this run installed Storybook, which decides the example-stories next step. */
async function storybook({
  hasStorybook,
}: {
  hasStorybook: boolean;
}): Promise<{ installedNow: boolean }> {
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

  // WHAT A PERSON TYPES AFTER A FAILED DOWNLOAD is the package manager's plain install: the files
  // and the package list are already written.
  // BUILD DEBT: the run below still installs the full setup in one call, so a failure cannot tell its
  // two failure points apart (the real error always shows the installer screen). Build adds
  // --skip-install, the lite conversion and one download, as two calls: the installer's failure
  // throws the installer screen, the download's failure throws the download screen.
  const plainInstall = resolveCommand(packageManager, 'install', []);
  const downloadItYourself = plainInstall
    ? `${plainInstall.command} ${plainInstall.args.join(' ')}`.trim()
    : '';

  // The longest step: a spinner in a terminal, and one line for an agent reading a pipe, so neither
  // takes the wait for a hang.
  const spinner = createSpinner('Installing Storybook...').start();

  try {
    await workstation().installStorybook({ command, projectRoot });
  } catch (error) {
    spinner.stop();
    printLines(renderFailedStepLine('Installing Storybook failed'));

    const failedOutput = getFailedCommandOutput(error);
    const failedAtDownload = (error as { during?: string }).during === 'download';

    throwError({
      ...(failedAtDownload
        ? renderStorybookDownloadFailed({ command: downloadItYourself, failedOutput })
        : renderStorybookInstallerFailed({ failedOutput })),
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
  ]);

  return { installedNow: true };
}

export default storybook;
