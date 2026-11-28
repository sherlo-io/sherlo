import { REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { throwError } from '../../../helpers';
import { renderNoReactNative } from '../../../render/initFixes';
import findPackageJsonPaths from './findPackageJsonPaths';
import hasDependency from './hasDependency';

/**
 * The app's OWN package.json lists react-native: React Native's autolinking reads that file, and a
 * monorepo root that lists it would let any workspace in the repository pass for an app.
 */
async function validateHasReactNative(): Promise<void> {
  const { current } = await findPackageJsonPaths();

  if (!(await hasDependency(current, REACT_NATIVE_PACKAGE_NAME))) {
    throwError(renderNoReactNative());
  }
}

export default validateHasReactNative;
