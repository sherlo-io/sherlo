/**
 * STEP 8 - THE GITHUB WORKFLOW, so every pull request and every push to main is tested.
 *
 * WHERE THE CODE LIVES DECIDES, NOT WHICH CI RUNS: on GitHub, or with no remote yet (most new apps
 * end up there), it is written even beside another CI, as it ends green until GitHub is connected
 * and the web app's Connect GitHub needs it. On another host GitHub never runs it, so it is
 * skipped. A workflow already in place is left as it is.
 *
 * AN APP INSIDE A MONOREPO: GitHub reads workflows only from the repository's root, so the file
 * goes there, the install runs in the workspace's root (where the lock file is), and the Sherlo
 * step runs in the app's folder. Proved on GitHub (spike monorepo-workflow, run 45783308426).
 * A plain app, whose folder is the repository, gets the file exactly as before.
 */
import fs from 'fs';
import path from 'path';
import { detect } from 'package-manager-detector';
import { getCwd } from '../../../helpers';
import { renderStepLine } from '../../../render/initSteps';
import { GITHUB_WORKFLOW_PATH, renderSherloWorkflow } from '../../../render/initWorkflow';
import { surroundings } from '../../../seams/surroundings';
import findPackageJsonPaths from '../requirements/findPackageJsonPaths';
import { printLines } from '../helpers';

const STEP_NAME = 'Added GitHub workflow';

/** The CI files that only run on a host other than GitHub, so with no remote yet they say the code will not live on GitHub. */
const OTHER_HOST_CI_FILES = ['.gitlab-ci.yml', 'bitbucket-pipelines.yml', 'azure-pipelines.yml'];

/**
 * The repository's root: the nearest folder at or above `folder` holding `.git` (a folder, or the
 * file a worktree has), null when none does.
 * BUILD DEBT (init-for-agents): the same walk as seams/appBuilder.ts `easUploadRoot`; move it to
 * src/helpers/findGitRoot.ts and have both call it.
 */
function findGitRoot(folder: string): string | null {
  let current = path.resolve(folder);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

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

  const { monorepoRoot } = await findPackageJsonPaths();
  const workspaceRoot = monorepoRoot ? path.dirname(monorepoRoot) : projectRoot;
  const repositoryRoot = findGitRoot(projectRoot) ?? workspaceRoot;
  const workflowFile = path.join(repositoryRoot, GITHUB_WORKFLOW_PATH);
  // Named from the app's folder, where the person ran setup: "../../.github/workflows/sherlo.yml".
  const workflowDetail = path.relative(projectRoot, workflowFile);

  // Sherlo's own workflow from an earlier run counts before another host's CI file does: setup put it there.
  const hasOtherHostCi =
    !remote && OTHER_HOST_CI_FILES.some((file) => fs.existsSync(path.join(repositoryRoot, file)));
  if (hasOtherHostCi && !fs.existsSync(workflowFile)) {
    printWhyNoWorkflow();
    return { hasWorkflow: false };
  }

  if (fs.existsSync(workflowFile)) {
    printLines([renderStepLine({ outcome: 'already', name: STEP_NAME, detail: workflowDetail })]);
    return { hasWorkflow: true };
  }

  // The agent, not the name: Yarn 1 and Yarn 2+ install with different words.
  const agent = (await detect({ cwd: workspaceRoot }))?.agent;
  const packageManager =
    agent === 'yarn' || agent === 'yarn@berry' || agent === 'pnpm' || agent === 'bun'
      ? agent
      : agent === 'pnpm@6'
        ? 'pnpm'
        : 'npm';

  fs.mkdirSync(path.dirname(workflowFile), { recursive: true });
  fs.writeFileSync(
    workflowFile,
    renderSherloWorkflow({
      packageManager,
      installFolder: path.relative(repositoryRoot, workspaceRoot),
      appFolder: path.relative(repositoryRoot, projectRoot),
    })
  );

  printLines([renderStepLine({ outcome: 'done', name: STEP_NAME, detail: workflowDetail })]);
  return { hasWorkflow: true };
}

export default githubWorkflow;
