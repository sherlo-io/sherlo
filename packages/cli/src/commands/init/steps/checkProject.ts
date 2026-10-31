/**
 * STEP 1 - IS THIS A REACT NATIVE APP SETUP CAN WORK IN? Read off the folder alone, with no network,
 * so a folder that fails here is left untouched and no browser opens.
 *
 * Storybook is not required any more: a project without it gets it in the Storybook step. A project
 * that has it must have a version Sherlo supports.
 */
import {
  EXPO_PACKAGE_NAME,
  MIN_REACT_NATIVE_VERSION,
  MIN_STORYBOOK_REACT_NATIVE_VERSION,
  REACT_NATIVE_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
} from '../../../constants';
import { isPackageVersionCompatible, throwError } from '../../../helpers';
import {
  renderPackagesNotInstalled,
  renderReactNativeTooOld,
  renderStorybookTooOld,
} from '../../../render/initFixes';
import { renderStepLine } from '../../../render/initSteps';
import { packageManagerCommand, printLines } from '../helpers';
import findPackageJsonPaths from '../requirements/findPackageJsonPaths';
import getPackageVersion from '../requirements/getPackageVersion';
import hasDependency from '../requirements/hasDependency';
import validateHasReactNative from '../requirements/validateHasReactNative';
import refuseUnreadableMetroConfig from '../requirements/refuseUnreadableMetroConfig';
import validateProjectContext from '../requirements/validateProjectContext';

export type CheckedProject = {
  /** Whether the project already has Storybook for React Native among its dependencies. */
  hasStorybook: boolean;
};

async function checkProject(): Promise<CheckedProject> {
  await validateProjectContext();
  await validateHasReactNative();

  const expoVersion = getPackageVersion(EXPO_PACKAGE_NAME);

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
        addReactNativeCommand: await packageManagerCommand('add', [
          `${REACT_NATIVE_PACKAGE_NAME}@${MIN_REACT_NATIVE_VERSION}`,
        ]),
        // BUILD DEBT (init-for-agents): the shared "is this a person's terminal" check, once it exists.
        reader: process.stdout.isTTY ? 'person' : 'agent',
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
          installCommand: await packageManagerCommand('add', [
            `${STORYBOOK_REACT_NATIVE_PACKAGE_NAME}@latest`,
          ]),
        })
      );
    }
    await refuseUnreadableMetroConfig();
  }

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

export default checkProject;

/* ========================================================================== */

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
