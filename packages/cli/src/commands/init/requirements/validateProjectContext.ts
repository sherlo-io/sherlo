import fastGlob from 'fast-glob';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { getCwd, throwError } from '../../../helpers';
import { renderMonorepoRoot, renderNotInAnApp } from '../../../render/initFixes';
import findPackageJsonPaths from './findPackageJsonPaths';

async function validateProjectContext(): Promise<void> {
  const { current, monorepoRoot } = await findPackageJsonPaths();

  if (!current) {
    throwError(renderNotInAnApp({ folder: getCwd() }));
  }

  if (current === monorepoRoot) {
    throwError(renderMonorepoRoot({ appFolders: await findAppFolders(dirname(current)) }));
  }
}

export default validateProjectContext;

/* ========================================================================== */

/**
 * The workspaces that list react-native, relative to the root, so the refusal names the folder to
 * go to. The workspaces are the root package.json's `workspaces` (npm, yarn, bun).
 */
async function findAppFolders(rootFolder: string): Promise<string[]> {
  const workspaceFolders = await fastGlob(await workspacePatterns(rootFolder), {
    cwd: rootFolder,
    onlyDirectories: true,
    ignore: ['**/node_modules/**'],
  });

  const appFolders: string[] = [];
  for (const folder of workspaceFolders.sort()) {
    const packageJson = await readPackageJson(join(rootFolder, folder, 'package.json'));
    const dependencies = { ...packageJson?.dependencies, ...packageJson?.devDependencies };
    if ('react-native' in dependencies) appFolders.push(folder);
  }

  return appFolders;
}

async function workspacePatterns(rootFolder: string): Promise<string[]> {
  // BUILD DEBT (init-for-agents): read pnpm-workspace.yaml's `packages` too; the CLI lists js-yaml
  // but has no types for it yet.
  const { workspaces } = (await readPackageJson(join(rootFolder, 'package.json'))) ?? {};
  return Array.isArray(workspaces) ? workspaces : (workspaces?.packages ?? []);
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
};

/** A workspace with no package.json, or one that does not parse, is no app. */
async function readPackageJson(packageJsonPath: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await readFile(packageJsonPath, 'utf-8')) as PackageJson;
  } catch {
    return null;
  }
}
