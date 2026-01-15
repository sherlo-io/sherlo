import { throwError } from '../../../helpers';
import findPackageJsonPaths from './findPackageJsonPaths';

const ERROR_NOT_RN_PROJECT = 'Init command must be run inside a React Native project';
const ERROR_MONOREPO_ROOT = `${ERROR_NOT_RN_PROJECT}, not in monorepo root`;

async function validateProjectContext(): Promise<void> {
  const { current, monorepoRoot } = await findPackageJsonPaths();

  if (!current) {
    throwError({ message: ERROR_NOT_RN_PROJECT });
  }

  if (current === monorepoRoot) {
    throwError({ message: ERROR_MONOREPO_ROOT });
  }
}

export default validateProjectContext;
