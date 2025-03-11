import { readFileSync } from 'fs';
import { join } from 'path';

const PACKAGE_JSON = 'package.json';

function getPackageVersion(packageName: string): string | null {
  const projectRoot = process.cwd();

  console.log(`[DEBUG] getPackageVersion - Attempting to find "${packageName}" in ${projectRoot}`);
  console.log(`[DEBUG] getPackageVersion - Current working directory: ${process.cwd()}`);

  try {
    // Przed wywołaniem require.resolve
    console.log(
      `[DEBUG] getPackageVersion - Trying require.resolve for ${packageName}/package.json`
    );

    const packagePath = require.resolve(`${packageName}/package.json`, { paths: [projectRoot] });
    console.log(`[DEBUG] getPackageVersion - Found package at path: ${packagePath}`);

    const packageJson = require(packagePath);
    console.log(`[DEBUG] getPackageVersion - Package version found: ${packageJson.version}`);

    return packageJson.version;
  } catch (error) {
    console.log(`[DEBUG] getPackageVersion - require.resolve failed with error: ${error.message}`);
    console.log('[DEBUG] getPackageVersion - Stack trace:', error.stack);

    // Spróbuj metodą fallback używając bezpośredniej ścieżki
    try {
      console.log(`[DEBUG] getPackageVersion - Trying fallback method with direct path`);

      const directPath = join(projectRoot, 'node_modules', packageName, 'package.json');
      console.log(`[DEBUG] getPackageVersion - Checking if file exists at: ${directPath}`);

      if (readFileSync(directPath, 'utf8')) {
        console.log(`[DEBUG] getPackageVersion - File exists at: ${directPath}`);

        const packageJson = JSON.parse(readFileSync(directPath, 'utf8'));
        console.log(
          `[DEBUG] getPackageVersion - Package version found (fallback): ${packageJson.version}`
        );

        return packageJson.version;
      }

      console.log(`[DEBUG] getPackageVersion - File does not exist at: ${directPath}`);
    } catch (fallbackError) {
      console.log(
        `[DEBUG] getPackageVersion - Fallback method failed with error: ${fallbackError.message}`
      );
      console.log('[DEBUG] getPackageVersion - Fallback stack trace:', fallbackError.stack);
    }

    // Wydrukuj path.resolve dla ścieżki, aby zobaczyć bezwzględną ścieżkę
    console.log(`[DEBUG] getPackageVersion - Absolute project path: ${join(projectRoot)}`);

    // Wypisz zawartość node_modules, jeśli istnieje
    const nodeModulesPath = join(projectRoot, 'node_modules');
    if (readFileSync(nodeModulesPath, 'utf8')) {
      console.log(`[DEBUG] getPackageVersion - node_modules exists at: ${nodeModulesPath}`);
      try {
        const dirs = readFileSync(nodeModulesPath, 'utf8')
          .split('\n')
          .filter(
            (dir) =>
              dir.includes(packageName) || (packageName === 'react-native' && dir.includes('react'))
          );
        console.log(
          `[DEBUG] getPackageVersion - Related directories in node_modules: ${JSON.stringify(dirs)}`
        );
      } catch (e) {
        console.log(`[DEBUG] getPackageVersion - Could not read node_modules: ${e.message}`);
      }
    } else {
      console.log(`[DEBUG] getPackageVersion - node_modules does not exist at: ${nodeModulesPath}`);
    }

    // Wypisz module.paths dla Node.js
    console.log(
      `[DEBUG] getPackageVersion - Node.js module paths:`,
      require.resolve.paths(packageName)
    );

    return null;
  }
}

export default getPackageVersion;
