import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import getCwd from './getCwd';
import throwError from './throwError';

const PACKAGE_JSON = 'package.json';

function getPackageVersion(packageName: string): string | null {
  let packagePath;
  let packageJson;

  try {
    packagePath = require.resolve(packageName, { paths: [getCwd()] });
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return null;
    }

    throwError({ type: 'unexpected', error });
  }

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
}

export default getPackageVersion;
