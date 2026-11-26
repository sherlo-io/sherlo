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
  renderReactNativeTooOld,
  renderStorybookFolderMissing,
  renderStorybookTooOld,
} from '../../../render/initFixes';
import { renderFailedStepLine, renderStepLine } from '../../../render/initSteps';
import hasConfigFile from '../config/hasConfigFile';
import readConfig from '../config/readConfig';
import { packageManagerCommand, printLines } from '../helpers';
import detectPackageManager from '../helpers/detectPackageManager';
import findPackageJsonPaths from '../requirements/findPackageJsonPaths';
import getDeclaredPackageVersion from '../requirements/getDeclaredPackageVersion';
import getPackageVersion from '../requirements/getPackageVersion';
import hasDependency from '../requirements/hasDependency';
import storybookUpgrade from '../requirements/storybookUpgrade';
import validateHasReactNative from '../requirements/validateHasReactNative';
import refuseUnreadableMetroConfig from '../requirements/refuseUnreadableMetroConfig';
import validateProjectContext from '../requirements/validateProjectContext';
import storybookFolder from './storybookFolder';

export type CheckedProject = {
  /** Whether the project already has Storybook for React Native among its dependencies. */
  hasStorybook: boolean;
};

/** A refusal here names its step with a red cross first, like every other stop of setup. */
async function checkProject(): Promise<CheckedProject> {
  try {
    return await checkTheApp();
  } catch (error) {
    printLines(renderFailedStepLine('Checking the app failed'));
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
  await detectPackageManager(getCwd());

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
    // THE FOLDER STORYBOOK RUNS FROM must be there: which setup the app uses, which stories are its
    // own and every next step read it, so a missing one stops here, before anything changes.
    const folder = storybookFolder();
    if (!folder || !fs.existsSync(path.join(getCwd(), folder))) {
      throwError(renderStorybookFolderMissing({ folder }));
    }
  }

  // A CONFIG THAT IS NOT VALID JSON is refused HERE, like a package.json that is not, so nothing is
  // logged in, made or installed for an app whose config setup could not read.
  if (hasConfigFile()) await readConfig();

  // Storybook the project already has shows here, with the versions it was checked at - never as an
  // install line, which would read as if setup had installed or changed it.
  const storybookVersion = hasStorybook
    ? getPackageVersion(STORYBOOK_REACT_NATIVE_PACKAGE_NAME)
    : null;

  printLines([
    renderStepLine({
      outcome: 'done',
      // "THE APP", NOT "THE PROJECT": project is the Sherlo project the later steps create or use.
      name: 'Checked the app',
      detail: [
        expoVersion ? `Expo ${majorOf(expoVersion)}` : null,
        `React Native ${minorOf(reactNativeVersion)}`,
        storybookVersion ? `Storybook ${minorOf(storybookVersion)}` : null,
      ]
        .filter(Boolean)
        .join(', '),
    }),
  ]);

  return { hasStorybook };
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

/** `54.0.0` -> `54`. */
function majorOf(version: string): string {
  return version.split('.')[0];
}

/** `0.81.5` -> `0.81`. */
function minorOf(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}
