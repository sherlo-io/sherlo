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
 * The CI files that only run on their own host, so with no remote yet they say where the code
 * will live. BUILD DEBT (init-for-agents): look in the repository's root too, not only in the
 * app's folder, for an app inside a monorepo.
 */
const HOST_CI_FILES: Array<{ file: string; host: string }> = [
  { file: '.gitlab-ci.yml', host: 'GitLab' },
  { file: 'bitbucket-pipelines.yml', host: 'Bitbucket' },
  { file: 'azure-pipelines.yml', host: 'Azure DevOps' },
];

/** The hosts a remote names often enough to say by name; any other is "another host". */
const REMOTE_HOSTS: Array<{ domain: string; host: string }> = [
  { domain: 'gitlab', host: 'GitLab' },
  { domain: 'bitbucket', host: 'Bitbucket' },
  { domain: 'dev.azure.com', host: 'Azure DevOps' },
];

/**
 * A SKIPPED WORKFLOW SAYS WHY, in one step line: a person sees why no workflow came, and an agent
 * learns the code is not on GitHub and adds no workflow itself.
 */
function printWhyNoWorkflow(host: string): void {
  printLines([
    renderStepLine({
      outcome: 'done',
      name: 'No GitHub workflow',
      detail: `the code is on ${host}`,
    }),
  ]);
}

/** Answers whether the project has Sherlo's workflow now, which the next steps name. */
async function githubWorkflow(): Promise<{ hasWorkflow: boolean }> {
  const projectRoot = getCwd();

  const remote = await surroundings().readGitRemote(projectRoot);
  if (remote && !remote.includes('github.com')) {
    printWhyNoWorkflow(
      REMOTE_HOSTS.find(({ domain }) => remote.includes(domain))?.host ?? 'another host'
    );
    return { hasWorkflow: false };
  }

  const workflowFile = path.join(projectRoot, WORKFLOW_PATH);
  // Sherlo's own workflow from an earlier run counts before a host's CI file does: setup put it there.
  const hostCi = remote
    ? undefined
    : HOST_CI_FILES.find(({ file }) => fs.existsSync(path.join(projectRoot, file)));
  if (hostCi && !fs.existsSync(workflowFile)) {
    printWhyNoWorkflow(hostCi.host);
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
