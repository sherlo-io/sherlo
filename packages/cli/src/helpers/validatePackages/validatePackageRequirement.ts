import { Command } from '../../types';
import getPackageVersion from '../getPackageVersion';
import { isPackageVersionCompatible } from '../shared';
import throwError from '../throwError';
import getPackageErrorMessage from './getPackageErrorMessage';
import { PackageRequirement } from './types';

function validatePackageRequirement(requirement: PackageRequirement, command?: Command) {
  const { packageName, minVersion } = requirement;
  const version = getPackageVersion(packageName);

  if (!version) {
    throwError({
      message: getPackageErrorMessage({
        command,
        packageName,
        type: 'missing',
      }),
    });
  }

  if (
    minVersion &&
    !isPackageVersionCompatible({
      version,
      minVersion,
    })
  ) {
    throwError({
      message: getPackageErrorMessage({
        command,
        packageName,
        type: 'version',
        versions: {
          current: version,
          min: minVersion,
        },
      }),
    });
  }

  return { packageName, version };
}

export default validatePackageRequirement;
