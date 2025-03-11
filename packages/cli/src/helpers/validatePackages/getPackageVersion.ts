import { throwError } from '../../helpers';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';

const PACKAGE_JSON = 'package.json';

function getPackageVersion(packageName: string): string | null {
  let packagePath;
  let packageJson;

  console.log(`\n\n[DEBUG] getPackageVersion(${packageName})`);

  try {
    packagePath = require.resolve(packageName);
    console.log(`[DEBUG] packagePath: ${packagePath}`);
  } catch (error) {
    console.log(`[DEBUG] error: ${error}`);

    if (error.code === 'MODULE_NOT_FOUND') {
      return null;
    }

    throwError({ type: 'unexpected', error });
  }

  let currentDir = dirname(packagePath);
  console.log(`[DEBUG] currentDir: ${currentDir}`);

  while (!currentDir.endsWith('node_modules') && currentDir !== '/') {
    try {
      const currentPackageJsonPath = join(currentDir, PACKAGE_JSON);
      console.log(`[DEBUG] currentPackageJsonPath: ${currentPackageJsonPath}`);

      const currentPackageJson = JSON.parse(readFileSync(currentPackageJsonPath, 'utf8'));
      console.log(`[DEBUG] currentPackageJson: ${currentPackageJson}`);

      if (currentPackageJson.name === packageName) {
        packageJson = currentPackageJson;
        console.log(`[DEBUG] packageJson: ${packageJson}`);
        break;
      }
    } catch {}

    currentDir = dirname(currentDir);
    console.log(`[DEBUG] currentDir: ${currentDir}`);
  }

  if (!packageJson) {
    throwError({
      type: 'unexpected',
      error: new Error(
        `Package ${packageName} was found at ${packagePath} but its ${PACKAGE_JSON} is invalid or inaccessible`
      ),
    });
  }

  console.log(`[DEBUG] packageJson.version: ${packageJson.version}`);

  return packageJson.version;
}

export default getPackageVersion;
