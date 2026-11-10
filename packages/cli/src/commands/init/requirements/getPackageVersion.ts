import { readFileSync } from 'fs';
import { throwError } from '../../../helpers';
import { findInstalledPackageJsonPath } from './findPackageJsonPaths';

function getPackageVersion(packageName: string): string | null {
  const packageJsonPath = findInstalledPackageJsonPath(packageName);

  if (!packageJsonPath) return null;

  try {
    return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
  } catch {
    return throwError({
      type: 'unexpected',
      error: new Error(
        `Package ${packageName} was found at ${packageJsonPath} but its package.json is invalid or inaccessible`
      ),
    });
  }
}

export default getPackageVersion;
