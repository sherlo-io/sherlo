import { Command } from '../../types';
import getPackageVersion from '../getPackageVersion';
import { isPackageVersionCompatible } from '../shared';
import throwError from '../throwError';
import getPackageErrorMessage from './getPackageErrorMessage';
import { PackageRequirement } from './types';

function validatePackageRequirement(requirement: PackageRequirement, command?: Command) {
  const version = getPackageVersion(requirement.packageName);

  if (!version) {
    throwError({
      message: getPackageErrorMessage({
        command,
        packageName: requirement.packageName,
        type: 'missing',
      }),
    });
  }

  if (
    requirement.minVersion &&
    !isPackageVersionCompatible({
      version,
      minVersion: requirement.minVersion,
    })
  ) {
    throwError({
      message: getPackageErrorMessage({
        command,
        packageName: requirement.packageName,
        type: 'version',
        versions: {
          current: version,
          min: requirement.minVersion,
        },
      }),
    });
  }
}

export default validatePackageRequirement;
