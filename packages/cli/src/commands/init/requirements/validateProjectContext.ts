import { REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { throwError } from '../../../helpers';
import findPackageJsonPaths from './findPackageJsonPaths';
import hasDependency from './hasDependency';

const ERROR_NOT_RN_PROJECT = 'Init command must be run inside a React Native project';
const ERROR_MONOREPO_ROOT = `${ERROR_NOT_RN_PROJECT}, not in monorepo root`;

async function validateProjectContext(): Promise<void> {
  const { current, monorepoRoot } = await findPackageJsonPaths();

  if (!current) {
    throwError({ message: ERROR_NOT_RN_PROJECT });
  }

  if (current === monorepoRoot && !(await hasDependency(current, REACT_NATIVE_PACKAGE_NAME))) {
    throwError({ message: ERROR_MONOREPO_ROOT });
  }
}

export default validateProjectContext;
