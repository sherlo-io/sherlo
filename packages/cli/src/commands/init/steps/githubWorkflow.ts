/**
 * STEP 8 - THE GITHUB WORKFLOW, so every pull request and every push to main is tested.
 *
 * Written when the repository is on GitHub, or has no remote yet (most new apps end up there, and
 * the file then works on the first push). Skipped when the remote is somewhere else. A workflow
 * already in place is left as it is.
 */
import fs from 'fs';
import path from 'path';
import { detect } from 'package-manager-detector';
import { getCwd } from '../../../helpers';
import { renderStepLine } from '../../../render/initSteps';
import { renderSherloWorkflow } from '../../../render/initWorkflow';
import { surroundings } from '../../../seams/surroundings';
import { printLines } from '../helpers';

const WORKFLOW_PATH = '.github/workflows/sherlo.yml';
const STEP_NAME = 'Added GitHub workflow';

/** Answers whether the project has Sherlo's workflow now, which the next steps name. */
async function githubWorkflow(): Promise<{ hasWorkflow: boolean }> {
  const projectRoot = getCwd();

  const remote = await surroundings().readGitRemote(projectRoot);
  if (remote && !remote.includes('github.com')) return { hasWorkflow: false };

  const workflowFile = path.join(projectRoot, WORKFLOW_PATH);
  if (fs.existsSync(workflowFile)) {
    printLines([renderStepLine({ outcome: 'already', name: STEP_NAME, detail: WORKFLOW_PATH })]);
    return { hasWorkflow: true };
  }

  const packageManager = (await detect({ cwd: projectRoot }))?.name ?? 'npm';

  fs.mkdirSync(path.dirname(workflowFile), { recursive: true });
  // BUILD DEBT (init-for-agents): the main branch read from the repository, not assumed.
  fs.writeFileSync(workflowFile, renderSherloWorkflow({ packageManager, mainBranch: 'main' }));

  printLines([renderStepLine({ outcome: 'done', name: STEP_NAME, detail: WORKFLOW_PATH })]);
  return { hasWorkflow: true };
}

export default githubWorkflow;
