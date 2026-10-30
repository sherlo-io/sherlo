import { getCwd, throwError } from '../../../helpers';
import { renderMonorepoRoot, renderNotInAnApp } from '../../../render/initFixes';
import findPackageJsonPaths from './findPackageJsonPaths';

async function validateProjectContext(): Promise<void> {
  const { current, monorepoRoot } = await findPackageJsonPaths();

  if (!current) {
    throwError(renderNotInAnApp({ folder: getCwd() }));
  }

  if (current === monorepoRoot) {
    // BUILD DEBT: the workspaces that list react-native, read from the root's `workspaces` or
    // pnpm-workspace.yaml, so the refusal names the folder to go to.
    throwError(renderMonorepoRoot({ appFolders: [] }));
  }
}

export default validateProjectContext;
