import chalk from 'chalk';
import { FULL_INIT_COMMAND } from '../../../../constants';
import { isPackageVersionCompatible, throwError } from '../../../../helpers';
import getPackageVersion from '../getPackageVersion';
import getPackageErrorMessage from './getPackageErrorMessage';
import { PackageRequirement } from './types';

function validatePackageRequirement(requirement: PackageRequirement) {
  const { packageName, minVersion } = requirement;
  const version = getPackageVersion(packageName);

  const below =
    '\n' +
    chalk.reset('Then re-run:\n') +
    chalk.cyan(`  ${FULL_INIT_COMMAND}`);

  if (!version) {
    throwError({
      message: getPackageErrorMessage({
        packageName,
        type: 'missing',
      }),
      below,
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
      below,
    });
  }

  return { packageName, version };
}

export default validatePackageRequirement;
