import { REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { throwError } from '../../../helpers';
import findPackageJsonPaths from './findPackageJsonPaths';
import hasDependency from './hasDependency';

const ERROR_NOT_RN_PROJECT = 'Init command must be run inside a React Native project';
const ERROR_MONOREPO_ROOT = `${ERROR_NOT_RN_PROJECT}, not in monorepo root`;

async function validateIsReactNativeProject(): Promise<void> {
  const { current, monorepoRoot } = await findPackageJsonPaths();

  if (!current) {
    throwError({ message: ERROR_NOT_RN_PROJECT });
  }

  if (current === monorepoRoot) {
    throwError({ message: ERROR_MONOREPO_ROOT });
  }

  const hasReactNative =
    (await hasDependency(current, REACT_NATIVE_PACKAGE_NAME)) ||
    (await hasDependency(monorepoRoot, REACT_NATIVE_PACKAGE_NAME));

  if (!hasReactNative) {
    throwError({ message: ERROR_NOT_RN_PROJECT });
  }
}

export default validateIsReactNativeProject;
