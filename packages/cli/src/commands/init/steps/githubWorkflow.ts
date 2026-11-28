/**
 * STEP 8 - THE GITHUB WORKFLOW, so every pull request and every push to main is tested.
 *
 * WHERE THE CODE LIVES DECIDES, NOT WHICH CI RUNS: it is written whenever any remote is on GitHub,
 * whenever there is no remote yet (most new apps end up there; a CI file of another host proves
 * nothing about where the code will live), and whenever a remote's host cannot be told. It ends
 * green until GitHub is connected, and the web app's Connect GitHub needs it. It is skipped only
 * when every remote is known to live elsewhere, where GitHub never runs it. A workflow already in
 * place is left as it is.
 *
 * AN APP INSIDE A MONOREPO: GitHub reads workflows only from the repository's root, so the file
 * goes there, the install runs in the workspace's root (where the lock file is), and the Sherlo
 * step runs in the app's folder. Proved on GitHub (spike monorepo-workflow, run 45783308426).
 * A plain app, whose folder is the repository, gets the file exactly as before.
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import {
  renderInitStepLine,
  renderNoGithubWorkflowLine,
  renderWorkflowTestsAnotherAppLine,
} from '../../../render/initSteps';
import { GITHUB_WORKFLOW_PATH, renderSherloWorkflow } from '../../../render/initWorkflow';
import { surroundings } from '../../../seams/surroundings';
import { workstation } from '../../../seams/workstation';
import findPackageJsonPaths from '../requirements/findPackageJsonPaths';
import { printLines, refuseFileAccess } from '../helpers';
import detectPackageManager from '../helpers/detectPackageManager';

/**
 * The repository's root: the nearest folder at or above `folder` holding `.git` (a folder, or the
 * file a worktree has), null when none does.
 * BUILD DEBT (init-for-agents): the same walk as seams/appBuilder.ts `easUploadRoot`; move it to
 * src/helpers/findGitRoot.ts and have both call it.
 */
export function findGitRoot(folder: string): string | null {
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
  printLines([renderNoGithubWorkflowLine()]);
}

/**
 * GitHub's own SSH hosts: `ssh.github.com` is GitHub's SSH over the HTTPS port
 * (docs.github.com, "Using SSH over the HTTPS port").
 */
const GITHUB_HOSTS = ['github.com', 'ssh.github.com'];

/**
 * Where one remote's code lives. AN SSH HOST NICKNAME IS ASKED, NOT GUESSED:
 * `git@github-work:acme/app.git` names a Host block of the person's SSH config, and only SSH knows
 * that block's real host, so an SSH host that is not GitHub's own is looked up with `ssh -G`. When
 * ssh is missing or fails, or the remote names no host (a local folder), where it lives is
 * 'unknown', and an unknown never skips the workflow.
 */
async function whereRemoteLives(remote: string): Promise<'github' | 'elsewhere' | 'unknown'> {
  // `ssh://git@github-work/acme/app.git`, `https://github.com/acme/app.git`, or the scp-like
  // `git@github-work:acme/app.git`; anything else (a local folder) names no host.
  const urlMatch = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/]+@)?([^:/]+)/i.exec(remote);
  const scpLikeMatch = urlMatch ? null : /^(?:[^@/]+@)?([^:/]+):(?!\/\/)/.exec(remote);
  const host = urlMatch?.[2] ?? scpLikeMatch?.[1];
  if (!host) return 'unknown';
  if (GITHUB_HOSTS.includes(host)) return 'github';

  const overSsh = scpLikeMatch !== null || /ssh/i.test(urlMatch?.[1] ?? '');
  if (!overSsh) return 'elsewhere';
  if (host.startsWith('-')) return 'unknown';
  const realHost = await workstation().readSshHostName(host);
  if (realHost === null) return 'unknown';
  return GITHUB_HOSTS.includes(realHost) ? 'github' : 'elsewhere';
}

/** Where Sherlo's workflow goes; null when every remote lives elsewhere and none is written. */
export type GithubWorkflowPlace = {
  workflowFile: string;
  repositoryRoot: string;
  workspaceRoot: string;
} | null;

/**
 * WHERE THE WORKFLOW GOES IS DECIDED WHILE SETUP CHECKS THE APP, so a path something stands in the
 * way of (a `.github` file) stops the run there, before the login, not at this step after a project
 * was made. The step itself then writes to the place decided.
 */
export async function findGithubWorkflowPlace(): Promise<GithubWorkflowPlace> {
  const projectRoot = getCwd();

  // EVERY REMOTE IS ASKED, whatever it is called: the workflow is skipped only when every one is
  // known to live elsewhere. One on GitHub, or one whose host cannot be told, writes it.
  const remotes = await surroundings().readGitRemotes(projectRoot);
  const places = await Promise.all(remotes.map(whereRemoteLives));
  if (places.length > 0 && places.every((place) => place === 'elsewhere')) return null;

  const { monorepoRoot } = await findPackageJsonPaths();
  const workspaceRoot = monorepoRoot ? path.dirname(monorepoRoot) : projectRoot;
  const repositoryRoot = findGitRoot(projectRoot) ?? workspaceRoot;
  return {
    workflowFile: path.join(repositoryRoot, GITHUB_WORKFLOW_PATH),
    repositoryRoot,
    workspaceRoot,
  };
}

/** A folder as a workflow writes it, from the repository's root: `./apps/mobile/` is `apps/mobile`, `.` is ''. */
function asFolder(word: string): string {
  return word.replace(/^\.\/?/, '').replace(/\/+$/, '');
}

/**
 * Whether a workflow already in place tests this app, and which folders it tests when it does not.
 * READ FROM THE FILE, NEVER GUESSED: each step that uses sherlo-io/sherlo runs in the
 * `working-directory` renderSherloWorkflow writes under it, or in the root ('') when it has none.
 * A file with no such step (written by hand, or unreadable) tests this app only when it names its
 * folder, or when the app is the repository itself; it names no other folder.
 */
function readWorkflowTests(
  workflowFile: string,
  appFolder: string
): { testsThisApp: boolean; testedFolders: string[] } {
  let text = '';
  try {
    text = fs.readFileSync(workflowFile, 'utf8');
  } catch {
    // Unreadable: it names no folder.
  }
  const testedFolders = sherloStepFolders(text);
  if (testedFolders.length > 0) {
    return { testsThisApp: testedFolders.includes(appFolder), testedFolders };
  }
  const namesThisApp = text
    .split(/[\s'"=:,]+/)
    .map(asFolder)
    .includes(appFolder);
  return { testsThisApp: appFolder === '' || namesThisApp, testedFolders: [] };
}

/** The folder each step using sherlo-io/sherlo runs in, from the repository's root ('' is the root). */
function sherloStepFolders(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const indentOf = (line: string) => line.length - line.trimStart().length;
  const folders: string[] = [];
  lines.forEach((line, at) => {
    const uses = /^(\s*(?:-\s+)?)uses:\s*['"]?sherlo-io\/sherlo@/.exec(line);
    if (!uses) return;
    // The step's own keys stand at the column of `uses`; its block ends at a line left of it.
    const keyColumn = uses[1].length;
    const inStep = (other: string) => other.trim() === '' || indentOf(other) >= keyColumn;
    // `- uses:` opens its step; a `uses:` under `- name:` has its step's keys above it too.
    let first = at;
    const opensStep = uses[1].includes('-');
    while (!opensStep && first > 0 && inStep(lines[first - 1])) first -= 1;
    let last = at;
    while (last < lines.length - 1 && inStep(lines[last + 1])) last += 1;
    const workingDirectory = lines
      .slice(first, last + 1)
      .map((stepLine) => /^\s*working-directory:\s*['"]?([^'"#\s]+)/.exec(stepLine)?.[1])
      .find((folder) => folder !== undefined);
    folders.push(workingDirectory === undefined ? '' : asFolder(workingDirectory));
  });
  return folders;
}

/** Answers whether the project has Sherlo's workflow now, which the next steps name. */
async function githubWorkflow(place: GithubWorkflowPlace): Promise<{ hasWorkflow: boolean }> {
  if (place === null) {
    printWhyNoWorkflow();
    return { hasWorkflow: false };
  }

  const projectRoot = getCwd();
  const { workflowFile, repositoryRoot, workspaceRoot } = place;
  // Named from the app's folder, where the person ran setup: "../../.github/workflows/sherlo.yml".
  const workflowDetail = path.relative(projectRoot, workflowFile);
  const appFolder = path.relative(repositoryRoot, projectRoot);

  if (fs.existsSync(workflowFile)) {
    const { testsThisApp, testedFolders } = readWorkflowTests(workflowFile, appFolder);
    if (testsThisApp) {
      printLines([
        renderInitStepLine({
          step: 'added-github-workflow',
          outcome: 'already',
          detail: workflowDetail,
        }),
      ]);
      return { hasWorkflow: true };
    }
    // ANOTHER APP'S WORKFLOW IS LEFT AS IT IS, and the line says this app gets no test from it.
    // BUILD ROW B99 (init-for-agents): a job of its own for a second app of a monorepo.
    printLines([
      renderWorkflowTestsAnotherAppLine({
        workflowFile: workflowDetail,
        testedFolders: testedFolders.map((folder) => folder || '.'),
      }),
    ]);
    return { hasWorkflow: false };
  }

  // The agent, not the name: Yarn 1 and Yarn 2+ install with different words.
  const agent = await detectPackageManager(workspaceRoot);
  // BUILD DEBT (init-for-agents): Deno has no workflow of its own yet and gets npm's, untested.
  const packageManager = agent === 'pnpm@6' ? 'pnpm' : agent === 'deno' ? 'npm' : agent;

  try {
    fs.mkdirSync(path.dirname(workflowFile), { recursive: true });
    fs.writeFileSync(
      workflowFile,
      renderSherloWorkflow({
        packageManager,
        installFolder: path.relative(repositoryRoot, workspaceRoot),
        appFolder,
      })
    );
  } catch (error) {
    refuseFileAccess({
      failedStep: 'adding-github-workflow',
      access: 'write',
      file: workflowFile,
      error,
    });
  }

  printLines([
    renderInitStepLine({ step: 'added-github-workflow', outcome: 'done', detail: workflowDetail }),
  ]);
  return { hasWorkflow: true };
}

export default githubWorkflow;
