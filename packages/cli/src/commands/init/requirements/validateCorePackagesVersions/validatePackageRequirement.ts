import { isPackageVersionCompatible, throwError } from '../../../../helpers';
import getPackageVersion from '../getPackageVersion';
import getPackageErrorMessage from './getPackageErrorMessage';
import { PackageRequirement } from './types';

function validatePackageRequirement(requirement: PackageRequirement) {
  const { packageName, minVersion } = requirement;
  const version = getPackageVersion(packageName);

  if (!version) {
    throwError({
      message: getPackageErrorMessage({
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
