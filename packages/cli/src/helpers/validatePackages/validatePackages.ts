import {
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EXPO_DEV_CLIENT_PACKAGE_NAME,
  EXPO_PACKAGE_NAME,
  INIT_COMMAND,
  MIN_EXPO_UPDATE_EXPO_VERSION,
  MIN_REACT_NATIVE_VERSION,
  MIN_STORYBOOK_REACT_NATIVE_VERSION,
  REACT_NATIVE_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
  TEST_COMMAND,
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TEST_EAS_UPDATE_COMMAND,
  TEST_STANDARD_COMMAND,
} from '../../constants';
import { reporting } from '../../helpers';
import { Command } from '../../types';
import { PackageRequirement } from './types';
import validatePackageRequirement from './validatePackageRequirement';

function validatePackages(command: Command) {
  const corePackageVersions = validateCoreRequirements();

  const commandPackageVersions = validateCommandRequirements(command);

  reporting.setContext('Required Packages', { ...corePackageVersions, ...commandPackageVersions });
}

export default validatePackages;

/* ========================================================================== */

type PackageVersion = {
  packageName: string;
  version: string;
};

const CORE_REQUIREMENTS: PackageRequirement[] = [
  { packageName: REACT_NATIVE_PACKAGE_NAME, minVersion: MIN_REACT_NATIVE_VERSION },
  {
    packageName: STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
    minVersion: MIN_STORYBOOK_REACT_NATIVE_VERSION,
  },
];

const COMMAND_REQUIREMENTS: Record<Command, PackageRequirement[] | null> = {
  [TEST_STANDARD_COMMAND]: null,
  [TEST_EAS_UPDATE_COMMAND]: [
    { packageName: EXPO_DEV_CLIENT_PACKAGE_NAME },
    { packageName: EXPO_PACKAGE_NAME, minVersion: MIN_EXPO_UPDATE_EXPO_VERSION },
  ],
  [TEST_EAS_CLOUD_BUILD_COMMAND]: [{ packageName: EXPO_PACKAGE_NAME }],
  [EAS_BUILD_ON_COMPLETE_COMMAND]: null,
  [TEST_COMMAND]: null,
  [INIT_COMMAND]: null,
};

function validateCoreRequirements(): PackageVersion[] {
  const packageVersions = CORE_REQUIREMENTS.map((requirement) =>
    validatePackageRequirement(requirement)
  );

  return packageVersions;
}

function validateCommandRequirements(command: Command): PackageVersion[] {
  const commandRequirements = COMMAND_REQUIREMENTS[command];

  if (commandRequirements) {
    return commandRequirements.map((requirement) =>
      validatePackageRequirement(requirement, command)
    );
  }

  return [];
}
