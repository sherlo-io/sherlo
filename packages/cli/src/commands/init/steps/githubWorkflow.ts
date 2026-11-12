/**
 * STEP 8 - THE GITHUB WORKFLOW, so every pull request and every push to main is tested.
 *
 * WHERE THE CODE LIVES DECIDES, NOT WHICH CI RUNS: on GitHub, or with no remote yet (most new apps
 * end up there), it is written even beside another CI, as it ends green until GitHub is connected
 * and the web app's Connect GitHub needs it. On another host GitHub never runs it, so it is
 * skipped. A workflow already in place is left as it is.
 */
import fs from 'fs';
import path from 'path';
import { detect } from 'package-manager-detector';
import { getCwd } from '../../../helpers';
import { renderStepLine } from '../../../render/initSteps';
import { GITHUB_WORKFLOW_PATH, renderSherloWorkflow } from '../../../render/initWorkflow';
import { surroundings } from '../../../seams/surroundings';
import { printLines } from '../helpers';

const WORKFLOW_PATH = GITHUB_WORKFLOW_PATH;
const STEP_NAME = 'Added GitHub workflow';

/**
 * The CI files that only run on a host other than GitHub, so with no remote yet they say the code
 * will not live on GitHub. BUILD DEBT (init-for-agents): look in the repository's root too, not
 * only in the app's folder, for an app inside a monorepo.
 */
const OTHER_HOST_CI_FILES = ['.gitlab-ci.yml', 'bitbucket-pipelines.yml', 'azure-pipelines.yml'];

/**
 * A SKIPPED WORKFLOW SAYS WHY, in one step line: a person sees why no workflow came, and an agent
 * learns the code is not on GitHub and adds no workflow itself. ONE GENERAL LINE, NO HOST NAMED:
 * naming GitLab or Bitbucket would mean telling every host apart, and
 * "not on GitHub" is all either reader needs.
 */
function printWhyNoWorkflow(): void {
  printLines([
    renderStepLine({
      outcome: 'done',
      name: 'No GitHub workflow',
      detail: 'the code is not on GitHub',
    }),
  ]);
}

/** Answers whether the project has Sherlo's workflow now, which the next steps name. */
async function githubWorkflow(): Promise<{ hasWorkflow: boolean }> {
  const projectRoot = getCwd();

  const remote = await surroundings().readGitRemote(projectRoot);
  if (remote && !remote.includes('github.com')) {
    printWhyNoWorkflow();
    return { hasWorkflow: false };
  }

  const workflowFile = path.join(projectRoot, WORKFLOW_PATH);
  // Sherlo's own workflow from an earlier run counts before another host's CI file does: setup put it there.
  const hasOtherHostCi =
    !remote && OTHER_HOST_CI_FILES.some((file) => fs.existsSync(path.join(projectRoot, file)));
  if (hasOtherHostCi && !fs.existsSync(workflowFile)) {
    printWhyNoWorkflow();
    return { hasWorkflow: false };
  }

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
