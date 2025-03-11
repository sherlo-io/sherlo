import { throwError } from '../../helpers';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';

const PACKAGE_JSON = 'package.json';

function getPackageVersion(packageName: string): string | null {
  const projectRoot = process.cwd();
  console.log(
    `[DEBUG] getPackageVersion - Looking for "${packageName}" starting from ${projectRoot}`
  );

  let packagePath;
  try {
    // Explicite określamy paths żeby wspierać monorepo
    packagePath = require.resolve(packageName, { paths: [projectRoot] });
    console.log(`[DEBUG] getPackageVersion - Found package entry at: ${packagePath}`);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log(`[DEBUG] getPackageVersion - Package "${packageName}" not found`);
      return null;
    }
    throwError({ type: 'unexpected', error });
  }

  // Szukamy package.json idąc w górę drzewa katalogów
  let currentDir = dirname(packagePath);
  console.log(`[DEBUG] getPackageVersion - Starting search from: ${currentDir}`);

  while (currentDir !== '/') {
    console.log(`[DEBUG] getPackageVersion - Checking directory: ${currentDir}`);

    try {
      const currentPackageJsonPath = join(currentDir, PACKAGE_JSON);
      const currentPackageJson = JSON.parse(readFileSync(currentPackageJsonPath, 'utf8'));

      // Sprawdzamy czy to właściwy package.json
      if (currentPackageJson.name === packageName) {
        console.log(
          `[DEBUG] getPackageVersion - Found matching package.json at: ${currentPackageJsonPath}`
        );
        console.log(`[DEBUG] getPackageVersion - Version: ${currentPackageJson.version}`);
        return currentPackageJson.version;
      }
    } catch (error) {
      // Ignorujemy błędy - po prostu idziemy dalej w górę
    }

    currentDir = dirname(currentDir);
  }

  // Jeśli doszliśmy tutaj, znaleźliśmy pakiet ale nie jego package.json
  throwError({
    type: 'unexpected',
    error: new Error(
      `Package ${packageName} was found at ${packagePath} but its ${PACKAGE_JSON} is invalid or inaccessible`
    ),
  });
}

export default getPackageVersion;
