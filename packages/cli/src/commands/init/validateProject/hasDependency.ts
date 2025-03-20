import { readFile } from 'fs/promises';
import { getEnhancedError, throwError } from '../../../helpers';

async function hasDependency(
  packageJsonPath: string | null,
  packageName: string
): Promise<boolean> {
  if (!packageJsonPath) return false;

  const dependencies = await readAllDependencies(packageJsonPath);

  return !!dependencies[packageName];
}

export default hasDependency;

/* ========================================================================== */

async function readAllDependencies(packageJsonPath: string): Promise<Record<string, string>> {
  let packageJson;

  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
  } catch (error) {
    throwError({
      type: 'unexpected',
      error: getEnhancedError(`Invalid ${packageJsonPath}`, error),
    });
  }

  return {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
}
