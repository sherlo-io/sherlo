import findPackageJsonPaths from './findPackageJsonPaths';
import getPackageVersion from './getPackageVersion';
import hasDependency from './hasDependency';

/**
 * The installed version of a package THIS APP depends on, or null. Node resolves a package upward
 * through every node_modules, so in a monorepo a package a sibling app depends on, hoisted to the
 * root, resolves from this app too. Only a package the app's own package.json lists, or the
 * monorepo root's (shared by every app), is the app's: the version is read only for those.
 */
async function getDeclaredPackageVersion(packageName: string): Promise<string | null> {
  const { current, monorepoRoot } = await findPackageJsonPaths();
  const isDeclared =
    (await hasDependency(current, packageName)) ||
    (await hasDependency(monorepoRoot, packageName));

  return isDeclared ? getPackageVersion(packageName) : null;
}

export default getDeclaredPackageVersion;
