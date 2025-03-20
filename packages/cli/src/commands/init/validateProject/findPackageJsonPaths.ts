import { findUp } from 'find-up';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { getCwd, getEnhancedError, throwError } from '../../../helpers';

async function findPackageJsonPaths(): Promise<{
  current: string | null;
  monorepoRoot: string | null;
}> {
  const cwd = getCwd();
  const currentPath = join(cwd, PACKAGE_JSON);

  const current = existsSync(currentPath) ? currentPath : null;

  // If current directory has package.json, check if it's monorepo root
  if (current && (await isMonorepoRoot(current))) {
    return { current, monorepoRoot: current };
  }

  // If not, look for monorepo root in parent directories
  const parentPath = await findUp(PACKAGE_JSON, {
    cwd: join(cwd, '..'),
  });

  const monorepoRoot = parentPath && (await isMonorepoRoot(parentPath)) ? parentPath : null;

  return { current, monorepoRoot };
}

export default findPackageJsonPaths;

/* ========================================================================== */

const PACKAGE_JSON = 'package.json';

async function isMonorepoRoot(packageJsonPath: string): Promise<boolean> {
  let packageJson;

  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
  } catch (error) {
    throwError({
      type: 'unexpected',
      error: getEnhancedError(`Invalid ${packageJsonPath}`, error),
    });
  }

  // Check for workspaces in package.json (npm/yarn/bun)
  if (packageJson.workspaces) return true;

  // Check for pnpm-workspace.yaml
  const pnpmWorkspacePath = join(dirname(packageJsonPath), 'pnpm-workspace.yaml');

  return existsSync(pnpmWorkspacePath);
}
