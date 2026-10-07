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
import { renderStepLine } from '../../../render/initSteps';
import { printLines } from '../helpers';
import findPackageJsonPaths from '../requirements/findPackageJsonPaths';
import getPackageVersion from '../requirements/getPackageVersion';
import hasDependency from '../requirements/hasDependency';
import validateHasReactNative from '../requirements/validateHasReactNative';
import validateHasWithStorybookInMetroConfig from '../requirements/validateHasWithStorybookInMetroConfig';
import validateProjectContext from '../requirements/validateProjectContext';
import validatePackageRequirement from '../requirements/validateCorePackagesVersions/validatePackageRequirement';

export type CheckedProject = {
  /** Whether the project already has Storybook for React Native among its dependencies. */
  hasStorybook: boolean;
};

async function checkProject(): Promise<CheckedProject> {
  await validateProjectContext();
  await validateHasReactNative();

  const { version: reactNativeVersion } = validatePackageRequirement({
    packageName: REACT_NATIVE_PACKAGE_NAME,
    minVersion: MIN_REACT_NATIVE_VERSION,
  });

  const { current, monorepoRoot } = await findPackageJsonPaths();
  const hasStorybook =
    (await hasDependency(current, STORYBOOK_REACT_NATIVE_PACKAGE_NAME)) ||
    (await hasDependency(monorepoRoot, STORYBOOK_REACT_NATIVE_PACKAGE_NAME));

  // A project that has Storybook must have it wired into Metro, checked HERE rather than at the
  // Metro step: a refusal after the login would leave a project made and the SDK installed for an
  // app setup could not finish. A project without Storybook gets the wiring from its installer.
  if (hasStorybook) {
    validatePackageRequirement({
      packageName: STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
      minVersion: MIN_STORYBOOK_REACT_NATIVE_VERSION,
    });
    await validateHasWithStorybookInMetroConfig();
  }

  const expoVersion = getPackageVersion(EXPO_PACKAGE_NAME);

  printLines([
    renderStepLine({
      outcome: 'done',
      name: 'Checked the project',
      detail: [
        expoVersion ? `Expo ${majorOf(expoVersion)}` : null,
        `React Native ${minorOf(reactNativeVersion)}`,
      ]
        .filter(Boolean)
        .join(', '),
    }),
  ]);

  return { hasStorybook };
}

export default checkProject;

/* ========================================================================== */

/** `54.0.0` -> `54`. */
function majorOf(version: string): string {
  return version.split('.')[0];
}

/** `0.81.5` -> `0.81`. */
function minorOf(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}
