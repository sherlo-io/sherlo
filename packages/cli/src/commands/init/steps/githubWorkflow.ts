/**
 * STEP 8 - THE GITHUB WORKFLOW, so every pull request and every push to main is tested.
 *
 * Written when the repository is on GitHub, or has no remote yet (most new apps end up there, and
 * the file then works on the first push). Skipped when the remote is somewhere else, or when the
 * project already runs another CI (operator, 2026-10-09): a second CI the team never asked for
 * would only fail for want of a secret. A workflow already in place is left as it is.
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

/**
 * The file each CI other than GitHub Actions keeps in the repository. One of them present means
 * the team already runs that CI. BUILD DEBT (init-for-agents): look in the repository's root too,
 * not only in the app's folder, for an app inside a monorepo.
 */
const OTHER_CI_FILES = [
  '.gitlab-ci.yml',
  'bitbucket-pipelines.yml',
  '.circleci/config.yml',
  'bitrise.yml',
  'codemagic.yaml',
  'azure-pipelines.yml',
  'Jenkinsfile',
  '.travis.yml',
  '.buildkite/pipeline.yml',
  '.eas/workflows',
];

/** Answers whether the project has Sherlo's workflow now, which the next steps name. */
async function githubWorkflow(): Promise<{ hasWorkflow: boolean }> {
  const projectRoot = getCwd();

  const remote = await surroundings().readGitRemote(projectRoot);
  if (remote && !remote.includes('github.com')) return { hasWorkflow: false };

  const workflowFile = path.join(projectRoot, WORKFLOW_PATH);
  // Sherlo's own workflow from an earlier run counts before another CI does: setup put it there.
  const runsAnotherCi = OTHER_CI_FILES.some((file) => fs.existsSync(path.join(projectRoot, file)));
  if (runsAnotherCi && !fs.existsSync(workflowFile)) return { hasWorkflow: false };

  if (fs.existsSync(workflowFile)) {
    printLines([renderStepLine({ outcome: 'already', name: STEP_NAME, detail: WORKFLOW_PATH })]);
    return { hasWorkflow: true };
  }

  const packageManager = (await detect({ cwd: projectRoot }))?.name ?? 'npm';

  fs.mkdirSync(path.dirname(workflowFile), { recursive: true });
  fs.writeFileSync(workflowFile, renderSherloWorkflow({ packageManager }));

  printLines([renderStepLine({ outcome: 'done', name: STEP_NAME, detail: WORKFLOW_PATH })]);
  return { hasWorkflow: true };
}

export default githubWorkflow;
