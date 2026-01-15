import {
  MIN_REACT_NATIVE_VERSION,
  MIN_STORYBOOK_REACT_NATIVE_VERSION,
  REACT_NATIVE_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
} from '../../../../constants';
import { reporting } from '../../../../helpers';
import { PackageRequirement } from './types';
import validatePackageRequirement from './validatePackageRequirement';

function validateCorePackagesVersions() {

  const packageVersions = CORE_PACKAGES_REQUIREMENTS.map((requirement) =>
    validatePackageRequirement(requirement)
  );

  reporting.setContext('Required Packages', { ...packageVersions });
}

export default validateCorePackagesVersions;

/* ========================================================================== */

const CORE_PACKAGES_REQUIREMENTS: PackageRequirement[] = [
  { packageName: REACT_NATIVE_PACKAGE_NAME, minVersion: MIN_REACT_NATIVE_VERSION },
  {
    packageName: STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
    minVersion: MIN_STORYBOOK_REACT_NATIVE_VERSION,
  },
];
