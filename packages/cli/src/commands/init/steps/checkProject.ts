/**
 * STEP 1 - IS THIS A REACT NATIVE APP SETUP CAN WORK IN? Read off the folder alone, with no network,
 * so a folder that fails here is left untouched and no browser opens.
 *
 * Storybook is not required any more: a project without it gets it in the Storybook step. A project
 * that has it must have a version Sherlo supports.
 */
import {
  EXPO_PACKAGE_NAME,
  MIN_EXPO_SDK,
  MIN_REACT_NATIVE_VERSION,
  MIN_STORYBOOK_REACT_NATIVE_VERSION,
  REACT_NATIVE_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
} from '../../../constants';
import { setupReader } from '../../feedback/runningAgent';
import { getCwd, isPackageVersionCompatible, throwError } from '../../../helpers';
import fs from 'fs';
import path from 'path';
import {
  renderPackagesNotInstalled,
  renderPlugNPlay,
  renderReactNativeTooOld,
  renderStorybookConfigPathUnread,
  renderStorybookFolderMissing,
  renderStorybookTooOld,
} from '../../../render/initFixes';
import { renderFailedInitStepLine, renderInitStepLine } from '../../../render/initSteps';
import { type FolderHistory, surroundings } from '../../../seams/surroundings';
import hasConfigFile from '../config/hasConfigFile';
import readConfig from '../config/readConfig';
import getMetroConfigPath from '../metroConfig/getMetroConfigPath';
import readMetroConfigCode from '../metroConfig/readMetroConfigCode';
import { packageManagerCommand, printLines } from '../helpers';
import { refuseBlockedPath } from '../helpers/refuseFileAccess';
import folderForStories from './folderForStories';
import { findGithubWorkflowPlace, type GithubWorkflowPlace } from './githubWorkflow';
import detectPackageManager, {
  folderHoldingYarnLock,
  readText,
} from '../helpers/detectPackageManager';
import findPackageJsonPaths from '../requirements/findPackageJsonPaths';
import getDeclaredPackageVersion from '../requirements/getDeclaredPackageVersion';
import getPackageVersion from '../requirements/getPackageVersion';
import hasDependency from '../requirements/hasDependency';
import storybookUpgrade from '../requirements/storybookUpgrade';
import validateHasReactNative from '../requirements/validateHasReactNative';
import refuseUnreadableMetroConfig from '../requirements/refuseUnreadableMetroConfig';
import validateProjectContext from '../requirements/validateProjectContext';
import storybookFolder, { DEFAULT_STORYBOOK_FOLDERS } from './storybookFolder';

export type CheckedProject = {
  /** Whether the project already has Storybook for React Native among its dependencies. */
  hasStorybook: boolean;
  /** Where the GitHub workflow step writes Sherlo's workflow, decided and checked here. */
  githubWorkflowPlace: GithubWorkflowPlace;
};

/** A refusal here names its step with a red cross first, like every other stop of setup. */
async function checkProject(): Promise<CheckedProject> {
  try {
    return await checkTheApp();
  } catch (error) {
    printLines(renderFailedInitStepLine('checking-the-app'));
    throw error;
  }
}

export default checkProject;

/* ========================================================================== */

async function checkTheApp(): Promise<CheckedProject> {
  await validateProjectContext();
  await validateHasReactNative();
  // Every later command runs in the app's own package manager: one setup cannot tell stops here,
  // before anything is installed or made.
  const packageManager = await detectPackageManager(getCwd());
  // Before any installed package is read: with Plug'n'Play an install leaves no node_modules, so
  // "install your dependencies" would change nothing.
  if (packageManager === 'yarn@berry') refusePlugNPlay();

  const expoVersion = await getDeclaredPackageVersion(EXPO_PACKAGE_NAME);

  const reactNativeVersion = await installedVersion(REACT_NATIVE_PACKAGE_NAME);
  if (
    !isPackageVersionCompatible({
      version: reactNativeVersion,
      minVersion: MIN_REACT_NATIVE_VERSION,
    })
  ) {
    throwError(
      renderReactNativeTooOld({
        current: reactNativeVersion,
        min: MIN_REACT_NATIVE_VERSION,
        isExpo: !!expoVersion,
        // BUILD DEBT (init-for-agents): read the installed Expo's major, as React Native's is read.
        expoSdk: expoVersion ? Number.parseInt(expoVersion.replace(/^\D*/, ''), 10) : undefined,
        minExpoSdk: MIN_EXPO_SDK,
        addReactNativeCommand: await packageManagerCommand('add', [
          `${REACT_NATIVE_PACKAGE_NAME}@${MIN_REACT_NATIVE_VERSION}`,
        ]),
        reader: setupReader(),
      })
    );
  }

  const { current, monorepoRoot } = await findPackageJsonPaths();
  const hasStorybook =
    (await hasDependency(current, STORYBOOK_REACT_NATIVE_PACKAGE_NAME)) ||
    (await hasDependency(monorepoRoot, STORYBOOK_REACT_NATIVE_PACKAGE_NAME));

  // A Metro config setup could not wire is refused HERE rather than at the Metro step: a refusal
  // after the login would leave a project made and the SDK installed for an app setup could not
  // finish. A project without Storybook gets its config from Storybook's installer.
  if (hasStorybook) {
    const installedStorybook = await installedVersion(STORYBOOK_REACT_NATIVE_PACKAGE_NAME);
    if (
      !isPackageVersionCompatible({
        version: installedStorybook,
        minVersion: MIN_STORYBOOK_REACT_NATIVE_VERSION,
      })
    ) {
      throwError(
        renderStorybookTooOld({
          current: installedStorybook,
          min: MIN_STORYBOOK_REACT_NATIVE_VERSION,
          upgrade: await storybookUpgrade(),
          reader: setupReader(),
        })
      );
    }
    await refuseUnreadableMetroConfig();
    // A CONFIGPATH SETUP CANNOT FOLLOW is named, never guessed past: a default folder in its place
    // could be another Storybook's.
    const metroConfigPath = getMetroConfigPath();
    const metroConfigCode = metroConfigPath
      ? readMetroConfigCode(fs.readFileSync(metroConfigPath, 'utf8'))
      : null;
    if (metroConfigPath && metroConfigCode?.configPathUnread) {
      throwError(
        renderStorybookConfigPathUnread({
          metroConfig: path.relative(getCwd(), metroConfigPath),
          configPath: metroConfigCode.configPathUnread,
        })
      );
    }
    // THE FOLDER STORYBOOK RUNS FROM must be there: which setup the app uses, which stories are its
    // own and every next step read it, so a missing one stops here, before anything changes.
    const folder = storybookFolder();
    if (!folder || !fs.existsSync(path.join(getCwd(), folder))) {
      // A folder git still holds or once held is restored; one it never held, or one git could
      // not answer for, is created or pointed at - never searched for, as a folder found by name
      // could be another Storybook's.
      throwError(
        renderStorybookFolderMissing({
          named: folder,
          ...(await storybookFolderHistory(folder ? [folder] : DEFAULT_STORYBOOK_FOLDERS)),
          metroConfig: metroConfigPath
            ? {
                file: path.relative(getCwd(), metroConfigPath),
                withStorybookCall: metroConfigCode?.withStorybookCall ?? null,
              }
            : null,
          storiesFolder: await folderForStories(),
        })
      );
    }
  }

  // A CONFIG THAT IS NOT VALID JSON is refused HERE, like a package.json that is not, so nothing is
  // logged in, made or installed for an app whose config setup could not read.
  if (hasConfigFile()) await readConfig();

  // FILES SETUP WRITES LATER are checked HERE too: a folder named metro.config.js, or a .github
  // that is a file, stops the run before the login rather than after a project was made.
  if (!getMetroConfigPath()) refuseBlockedPath(path.join(getCwd(), 'metro.config.js'));
  const githubWorkflowPlace = await findGithubWorkflowPlace();
  if (githubWorkflowPlace) refuseBlockedPath(githubWorkflowPlace.workflowFile);

  // Storybook the project already has shows here, with the versions it was checked at - never as an
  // install line, which would read as if setup had installed or changed it.
  const storybookVersion = hasStorybook
    ? getPackageVersion(STORYBOOK_REACT_NATIVE_PACKAGE_NAME)
    : null;

  printLines([
    renderInitStepLine({
      step: 'checked-the-app',
      outcome: 'done',
      detail: [
        expoVersion ? `Expo ${majorOf(expoVersion)}` : null,
        `React Native ${minorOf(reactNativeVersion)}`,
        storybookVersion ? `Storybook ${minorOf(storybookVersion)}` : null,
      ]
        .filter(Boolean)
        .join(', '),
    }),
  ]);

  return { hasStorybook, githubWorkflowPlace };
}

/**
 * The version node_modules holds. A package package.json lists but node_modules lacks means the
 * dependencies were never installed, and the refusal gives the install command.
 */
async function installedVersion(packageName: string): Promise<string> {
  const version = getPackageVersion(packageName);
  if (version) return version;

  return throwError(
    renderPackagesNotInstalled({
      packageName,
      installCommand: await packageManagerCommand('install'),
    })
  );
}

/**
 * YARN 2+ INSTALLS WITH PLUG'N'PLAY UNLESS A .yarnrc.yml SAYS OTHERWISE. Yarn reads every
 * .yarnrc.yml from the app's folder up, the nearest `nodeLinker:` winning, and with none it uses
 * pnp. So the answer comes from that setting, never from what an install left behind (.pnp.cjs):
 * an app with nothing installed yet gets it first, not an install that would change nothing. A
 * `nodeLinker: pnp` line is named to be changed; with none, the line is added to the .yarnrc.yml
 * beside yarn.lock, in Yarn's project folder.
 */
function refusePlugNPlay(): void {
  let directory = path.resolve(getCwd());
  const { root } = path.parse(directory);
  while (true) {
    const yarnrc = path.join(directory, '.yarnrc.yml');
    const line = readText(yarnrc).match(/^nodeLinker:.*$/m)?.[0];
    if (line) {
      if (!/^nodeLinker:\s*["']?pnp["']?\s*(#.*)?$/.test(line)) return;
      return throwError(
        renderPlugNPlay({
          yarnrc: path.relative(getCwd(), yarnrc),
          pnpLine: line.trim(),
          yarnrcExists: true,
        })
      );
    }
    if (directory === root) break;
    directory = path.dirname(directory);
  }

  const yarnrc = path.join(folderHoldingYarnLock(getCwd()) ?? getCwd(), '.yarnrc.yml');
  throwError(
    renderPlugNPlay({
      yarnrc: path.relative(getCwd(), yarnrc),
      pnpLine: null,
      yarnrcExists: fs.existsSync(yarnrc),
    })
  );
}

/**
 * What git knows of the missing folder: the first of the folders git still holds in the last
 * commit or a commit deleted, with that folder. One the git read could not answer for makes the
 * whole answer unknown, as the same repository answers for every folder.
 */
async function storybookFolderHistory(
  folders: string[]
): Promise<{ folder: string; history: FolderHistory }> {
  for (const folder of folders) {
    const history = await surroundings().folderHistory(getCwd(), folder);
    if (history.held !== 'never') return { folder, history };
  }
  return { folder: folders[0], history: { held: 'never' } };
}

/** `54.0.0` -> `54`. */
function majorOf(version: string): string {
  return version.split('.')[0];
}

/** `0.81.5` -> `0.81`. */
function minorOf(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}
