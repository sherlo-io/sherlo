import fastGlob from 'fast-glob';
import { readFile } from 'fs/promises';
// js-yaml ships no types of its own. Build adds @types/js-yaml to devDependencies (a task of
// init-for-agents), and this line goes then.
// @ts-expect-error
import { load } from 'js-yaml';
import { dirname, join } from 'path';
import { REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { getCwd, throwError } from '../../../helpers';
import { renderMonorepoRoot, renderNotInAnApp } from '../../../render/initFixes';
import findPackageJsonPaths, { pnpmWorkspaceFile } from './findPackageJsonPaths';
import hasDependency from './hasDependency';

async function validateProjectContext(): Promise<void> {
  const { current, monorepoRoot } = await findPackageJsonPaths();

  if (!current) {
    throwError(renderNotInAnApp({ folder: getCwd() }));
  }

  // A root that lists react-native itself is the app, not a monorepo root to refuse.
  if (current === monorepoRoot && !(await hasDependency(current, REACT_NATIVE_PACKAGE_NAME))) {
    throwError(renderMonorepoRoot({ appFolders: await findAppFolders(dirname(current)) }));
  }
}

export default validateProjectContext;

/* ========================================================================== */

/**
 * The workspaces that list react-native, relative to the root, so the refusal names the folder to
 * go to. The workspaces are the root package.json's `workspaces` (npm, yarn, bun) and
 * pnpm-workspace.yaml's `packages` (pnpm).
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
  const { workspaces } = (await readPackageJson(join(rootFolder, 'package.json'))) ?? {};
  const packageJsonPatterns = Array.isArray(workspaces) ? workspaces : (workspaces?.packages ?? []);

  return [...packageJsonPatterns, ...(await pnpmWorkspacePatterns(rootFolder))];
}

/** pnpm-workspace.yaml's `packages`. No file, or one that does not parse, lists none. */
async function pnpmWorkspacePatterns(rootFolder: string): Promise<string[]> {
  try {
    const { packages } = (load(await readFile(pnpmWorkspaceFile(rootFolder), 'utf-8')) ?? {}) as {
      packages?: unknown;
    };
    return Array.isArray(packages)
      ? packages.filter((pattern): pattern is string => typeof pattern === 'string')
      : [];
  } catch {
    return [];
  }
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
