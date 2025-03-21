import { throwError } from '../../../helpers';
import { ProjectType } from '../types';
import findPackageJsonPaths from './findPackageJsonPaths';
import hasDependency from './hasDependency';

async function getProjectType(): Promise<ProjectType> {
  const { current, monorepoRoot } = await findPackageJsonPaths();

  if (!current) {
    throwError({ message: ERROR_NOT_RN_PROJECT });
  }

  if (current === monorepoRoot) {
    throwError({ message: ERROR_MONOREPO_ROOT });
  }

  const projectType = await detectProjectType(current, monorepoRoot);

  if (!projectType) {
    throwError({ message: ERROR_NOT_RN_PROJECT });
  }

  return projectType;
}

export default getProjectType;

/* ========================================================================== */

const ERROR_NOT_RN_PROJECT =
  'Init command must be run inside a React Native (or Expo) project directory';
const ERROR_MONOREPO_ROOT = `${ERROR_NOT_RN_PROJECT}, not in monorepo root`;

async function detectProjectType(
  currentPath: string,
  monorepoPath: string | null
): Promise<ProjectType | null> {
  return (
    (await getProjectTypeFromDeps(currentPath)) ?? (await getProjectTypeFromDeps(monorepoPath))
  );
}

async function getProjectTypeFromDeps(packageJsonPath: string | null): Promise<ProjectType | null> {
  if (await hasDependency(packageJsonPath, 'expo')) return 'expo';
  if (await hasDependency(packageJsonPath, 'react-native')) return 'react-native';

  return null;
}
