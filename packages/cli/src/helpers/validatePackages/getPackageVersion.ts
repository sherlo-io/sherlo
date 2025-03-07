import { throwError } from '../../helpers';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';

const PACKAGE_JSON = 'package.json';

function getPackageVersion(packageName: string): string | null {
  let packagePath;
  let packageJson;

  try {
    packagePath = require.resolve(packageName);
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
      console.log(`[DEBUG JSON] Reading package.json from: ${currentPackageJsonPath}`);
      const jsonContent = readFileSync(currentPackageJsonPath, 'utf8');

      try {
        const currentPackageJson = JSON.parse(jsonContent);
        console.log(`[DEBUG JSON] Successfully parsed package.json for: ${currentPackageJsonPath}`);

        if (currentPackageJson.name === packageName) {
          packageJson = currentPackageJson;
          break;
        }
      } catch (parseError) {
        console.error(`[DEBUG JSON] Error parsing package.json: ${parseError.message}`);
        console.error(`[DEBUG JSON] Content preview: ${jsonContent.substring(0, 50)}...`);
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
