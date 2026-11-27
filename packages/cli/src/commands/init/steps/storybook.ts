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
import fs from 'fs';
import path from 'path';
import { STORYBOOK_REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { getCwd, spinner as createSpinner, throwError } from '../../../helpers';
import { renderStorybookInstallFailed } from '../../../render/initFixes';
import {
  renderFailedStepLine,
  renderPnpmSettingsLine,
  renderStepLine,
} from '../../../render/initSteps';
import { type InstallFailure, workstation } from '../../../seams/workstation';
import { addCommand } from '../dependencies/installSherlo';
import { printLines } from '../helpers';
import detectPackageManager from '../helpers/detectPackageManager';
import findPackageJsonPaths, { pnpmWorkspaceFile } from '../requirements/findPackageJsonPaths';
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
  const tool = await detectPackageManager(projectRoot);
  // pnpm reads its settings only from the workspace root's file, never from an app folder's.
  const { monorepoRoot } = await findPackageJsonPaths();
  const workspaceSettingsFile = monorepoRoot && pnpmWorkspaceFile(path.dirname(monorepoRoot));
  const pnpmSettingsFile =
    workspaceSettingsFile && fs.existsSync(workspaceSettingsFile)
      ? workspaceSettingsFile
      : pnpmWorkspaceFile(projectRoot);
  const command = addCommand(
    tool,
    Object.entries(STORYBOOK_VERSIONS).map(([name, version]) => `${name}@${version}`)
  );

  // The longest step: a spinner in a terminal, and one line for an agent reading a pipe, so neither
  // takes the wait for a hang.
  const spinner = createSpinner('Installing Storybook...').start();

  // Read before the install writes it, so the line says Created for a file that was not there, as
  // the Metro config's does.
  const hadPnpmSettings = fs.existsSync(pnpmSettingsFile);
  // Read before the install too: the packages it adds beside Storybook's own (the animation
  // packages a lite setup needs, safe-area-context) are named, as every change setup makes is.
  const dependenciesBefore = declaredDependencies(projectRoot);
  let updatedPnpmSettings = false;
  try {
    // Only `--json` lets Yarn 2+ tell an error from a warning (../../../render/installOutput).
    ({ updatedPnpmSettings } = await workstation().installStorybook({
      command: tool === 'yarn@berry' ? `${command} --json` : command,
      projectRoot,
      pnpmSettingsFile,
    }));
  } catch (error) {
    spinner.stop();
    printLines(renderFailedStepLine('Installing Storybook failed'));

    // The command, with the versions Sherlo tested, picks the package manager's output and log.
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
  const addedBesideStorybook = Object.entries(declaredDependencies(projectRoot)).filter(
    ([name]) => !(name in dependenciesBefore) && !(name in STORYBOOK_VERSIONS)
  );
  printLines([
    renderStepLine({
      outcome: 'done',
      name: 'Installed Storybook',
      // NEVER A NULL VERSION: where no package.json of it is on disk to read (Yarn 4 keeps packages
      // in its own store), the version is the exact one the install just added.
      detail: `${STORYBOOK_REACT_NATIVE_PACKAGE_NAME} ${
        getPackageVersion(STORYBOOK_REACT_NATIVE_PACKAGE_NAME) ??
        STORYBOOK_VERSIONS['@storybook/react-native']
      }`,
    }),
    // The version installed, read from node_modules; the range package.json declares where none
    // is on disk to read.
    ...addedBesideStorybook.map(([name, declaredRange]) =>
      renderStepLine({
        outcome: 'done',
        name: 'Added for Storybook',
        detail: `${name} ${getPackageVersion(name) ?? declaredRange}`,
      })
    ),
    ...(updatedPnpmSettings
      ? [
          renderPnpmSettingsLine({
            had: hadPnpmSettings,
            file: path.relative(projectRoot, pnpmSettingsFile),
          }),
        ]
      : []),
  ]);

  return { installedNow: true };
}

/** The packages the project's package.json declares, by name, with the range each asks for. */
function declaredDependencies(projectRoot: string): Record<string, string> {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
  return { ...packageJson.devDependencies, ...packageJson.dependencies };
}

export default storybook;
