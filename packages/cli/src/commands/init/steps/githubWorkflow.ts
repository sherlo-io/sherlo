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
const OTHER_CI_FILES: Array<{ file: string; ci: string }> = [
  { file: '.gitlab-ci.yml', ci: 'GitLab CI' },
  { file: 'bitbucket-pipelines.yml', ci: 'Bitbucket Pipelines' },
  { file: '.circleci/config.yml', ci: 'CircleCI' },
  { file: 'bitrise.yml', ci: 'Bitrise' },
  { file: 'codemagic.yaml', ci: 'Codemagic' },
  { file: 'azure-pipelines.yml', ci: 'Azure Pipelines' },
  { file: 'Jenkinsfile', ci: 'Jenkins' },
  { file: '.travis.yml', ci: 'Travis CI' },
  { file: '.buildkite/pipeline.yml', ci: 'Buildkite' },
  { file: '.eas/workflows', ci: 'EAS Workflows' },
];

/** The hosts a remote names often enough to say by name; any other is "another host". */
const REMOTE_HOSTS: Array<{ domain: string; host: string }> = [
  { domain: 'gitlab', host: 'GitLab' },
  { domain: 'bitbucket', host: 'Bitbucket' },
  { domain: 'dev.azure.com', host: 'Azure DevOps' },
];

/**
 * A SKIPPED WORKFLOW SAYS WHY, in one step line (operator, 2026-10-09): a person sees why the CI
 * step names their own CI, and an agent learns the project has a CI and adds no workflow itself.
 */
function printWhyNoWorkflow(detail: string): void {
  printLines([renderStepLine({ outcome: 'done', name: 'Found CI', detail: `${detail}, so no GitHub workflow added` })]);
}

/** Answers whether the project has Sherlo's workflow now, which the next steps name. */
async function githubWorkflow(): Promise<{ hasWorkflow: boolean }> {
  const projectRoot = getCwd();

  const remote = await surroundings().readGitRemote(projectRoot);
  if (remote && !remote.includes('github.com')) {
    const host = REMOTE_HOSTS.find(({ domain }) => remote.includes(domain))?.host ?? 'another host';
    printWhyNoWorkflow(`the repository is on ${host}`);
    return { hasWorkflow: false };
  }

  const workflowFile = path.join(projectRoot, WORKFLOW_PATH);
  // Sherlo's own workflow from an earlier run counts before another CI does: setup put it there.
  const otherCi = OTHER_CI_FILES.find(({ file }) => fs.existsSync(path.join(projectRoot, file)));
  if (otherCi && !fs.existsSync(workflowFile)) {
    printWhyNoWorkflow(otherCi.ci);
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
