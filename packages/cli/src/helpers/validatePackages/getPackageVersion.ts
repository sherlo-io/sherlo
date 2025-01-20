import { throwError } from '../../helpers';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';

const PACKAGE_JSON = 'package.json';

function getPackageVersion(packageName: string): string | null {
  try {
    const packagePath = require.resolve(packageName);
    let packageJson = null;

    let currentDir = dirname(packagePath);
    while (!currentDir.endsWith('node_modules') && currentDir !== '/') {
      try {
        const currentPackageJsonPath = join(currentDir, PACKAGE_JSON);
        const currentPackageJson = JSON.parse(readFileSync(currentPackageJsonPath, 'utf8'));

        if (currentPackageJson.name === packageName) {
          packageJson = currentPackageJson;
          break;
        }
      } catch {}

      currentDir = dirname(currentDir);
    }

    if (!packageJson) {
      throwError({
        type: 'unexpected',
        error: new Error(
          `Package ${packageName} was found at ${packagePath} but its ${PACKAGE_JSON} is invalid or inaccessible`
        ),
      });
    }

    return packageJson.version;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'MODULE_NOT_FOUND') {
      return null;
    }

    throwError({ type: 'unexpected', error });
  }
}

export default getPackageVersion;
