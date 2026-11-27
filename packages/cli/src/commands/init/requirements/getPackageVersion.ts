import { readFileSync } from 'fs';
import { throwError } from '../../../helpers';
import { findInstalledPackageJsonPath } from './findPackageJsonPaths';

/**
 * An installed package whose package.json could not be read or parsed. Every command shows it as an
 * unexpected error; setup, which knows the app's package manager, refuses it with the install
 * command that writes the file again (../init).
 */
export class InstalledPackageUnreadableError extends Error {
  constructor(
    readonly packageJsonPath: string,
    /** The read's or the parser's own words, e.g. "Unexpected end of JSON input". */
    readonly reason: string
  ) {
    super(`The installed package.json at ${packageJsonPath} can't be read: ${reason}`);
  }
}

function getPackageVersion(packageName: string): string | null {
  const packageJsonPath = findInstalledPackageJsonPath(packageName);

  if (!packageJsonPath) return null;

  try {
    return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
  } catch (error) {
    return throwError({
      type: 'unexpected',
      error: new InstalledPackageUnreadableError(packageJsonPath, (error as Error).message),
    });
  }
}

export default getPackageVersion;
