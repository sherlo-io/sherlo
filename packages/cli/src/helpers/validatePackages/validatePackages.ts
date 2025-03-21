import {
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_DEV_CLIENT_PACKAGE_NAME,
  EXPO_PACKAGE_NAME,
  EXPO_UPDATE_COMMAND,
  INIT_COMMAND,
  LOCAL_BUILDS_COMMAND,
  MIN_EXPO_UPDATE_EXPO_VERSION,
  MIN_REACT_NATIVE_VERSION,
  MIN_STORYBOOK_REACT_NATIVE_VERSION,
  REACT_NATIVE_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
} from '../../constants';
import { Command } from '../../types';
import { PackageRequirement } from './types';
import validatePackageRequirement from './validatePackageRequirement';

function validatePackages(command: Command) {
  validateCoreRequirements();

  validateCommandRequirements(command);
}

export default validatePackages;

/* ========================================================================== */

const CORE_REQUIREMENTS: PackageRequirement[] = [
  { packageName: REACT_NATIVE_PACKAGE_NAME, minVersion: MIN_REACT_NATIVE_VERSION },
  {
    packageName: STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
    minVersion: MIN_STORYBOOK_REACT_NATIVE_VERSION,
  },
];

function validateCoreRequirements() {
  CORE_REQUIREMENTS.forEach((requirement) => validatePackageRequirement(requirement));
}

const COMMAND_REQUIREMENTS: Record<Command, PackageRequirement[] | null> = {
  [LOCAL_BUILDS_COMMAND]: null,
  [EXPO_UPDATE_COMMAND]: [
    { packageName: EXPO_DEV_CLIENT_PACKAGE_NAME },
    { packageName: EXPO_PACKAGE_NAME, minVersion: MIN_EXPO_UPDATE_EXPO_VERSION },
  ],
  [EXPO_CLOUD_BUILDS_COMMAND]: [{ packageName: EXPO_PACKAGE_NAME }],
  [EAS_BUILD_ON_COMPLETE_COMMAND]: null,
  [INIT_COMMAND]: null,
};

function validateCommandRequirements(command: Command) {
  const commandRequirements = COMMAND_REQUIREMENTS[command];

  if (commandRequirements) {
    commandRequirements.forEach((requirement) => validatePackageRequirement(requirement, command));
  }
}
