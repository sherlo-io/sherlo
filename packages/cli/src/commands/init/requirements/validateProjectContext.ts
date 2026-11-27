import fastGlob from 'fast-glob';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
// js-yaml ships no types of its own. Build adds @types/js-yaml to devDependencies (a task of
// init-for-agents), and this line goes then.
// @ts-expect-error
import { load } from 'js-yaml';
import { dirname, join, relative } from 'path';
import { REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { getCwd, throwError } from '../../../helpers';
import {
  renderFileAccessFailed,
  renderMonorepoRoot,
  renderNotInAnApp,
  renderWorkspacesWrongShape,
} from '../../../render/initFixes';
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

/**
 * A WORKSPACE LIST SETUP CAN'T READ IS NAMED, never read as an empty one: an empty list would say
 * no React Native app is in the workspace, sending the person to look for one that is there.
 */
async function workspacePatterns(rootFolder: string): Promise<string[]> {
  const { workspaces } = (await readPackageJson(join(rootFolder, 'package.json'))) ?? {};
  const packageJsonPatterns =
    workspaces === undefined
      ? []
      : Array.isArray(workspaces)
        ? workspaces
        : Array.isArray(workspaces.packages)
          ? workspaces.packages
          : throwError(
              renderWorkspacesWrongShape({
                file: relative(getCwd(), join(rootFolder, 'package.json')) || 'package.json',
                value: workspaces,
              })
            );

  return [...packageJsonPatterns, ...(await pnpmWorkspacePatterns(rootFolder))];
}

/** pnpm-workspace.yaml's `packages`. No file lists none; a file YAML can't parse is refused. */
async function pnpmWorkspacePatterns(rootFolder: string): Promise<string[]> {
  const file = pnpmWorkspaceFile(rootFolder);
  if (!existsSync(file)) return [];

  let parsed: unknown;
  try {
    parsed = load(await readFile(file, 'utf-8'));
  } catch (error) {
    // js-yaml's own reason and place, without the code excerpt its message carries.
    const { reason, mark } = error as { reason?: string; mark?: { line: number; column: number } };
    throwError(
      renderFileAccessFailed({
        access: 'read',
        file: relative(getCwd(), file) || file,
        cause: {
          reason: mark
            ? `${reason} at line ${mark.line + 1}, column ${mark.column + 1}`
            : (error as Error).message,
        },
      })
    );
  }

  const { packages } = (parsed ?? {}) as { packages?: unknown };
  return Array.isArray(packages)
    ? packages.filter((pattern): pattern is string => typeof pattern === 'string')
    : [];
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
