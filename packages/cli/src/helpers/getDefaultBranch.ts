import fs from 'fs';
import type runShellCommandType from './runShellCommand';

/**
 * The shell runner, handed in by getGitInfo (the live half that owns the shell): this file reads
 * the answer, it does not reach the shell on its own.
 */
type RunShellCommand = typeof runShellCommandType;

/** How long a push waits for the git host to name the default branch before it goes on without. */
export const HOST_ASK_TIMEOUT_MS = 10_000;

/** Every git command that talks to the host runs with prompts off: terminal prompts off, askpass a program that fails. */
export const PROMPT_OFF_ENV = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'false' };

/**
 * The repository's default branch as reported by GitHub Actions.
 *
 * The runner writes the triggering event's JSON payload to the file named by
 * `GITHUB_EVENT_PATH`, and MOST events (push, pull_request, workflow_dispatch, …) embed
 * the full `repository` object, whose `default_branch` is the branch GitHub
 * itself considers the project's main line. That makes this the most
 * authoritative rung: it is the platform's own answer, and it holds even on a
 * fetch-depth:1 checkout that carries no remote refs at all.
 *
 * Returns undefined when the variable, the file, or the field is absent (e.g.
 * outside GitHub Actions, or on an event type that carries no `repository`).
 */
function getDefaultBranchFromGitHubEvent(): string | undefined {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return undefined;
  try {
    const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const branch = payload?.repository?.default_branch;
    return typeof branch === 'string' && branch.length > 0 ? branch : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Asks the git host itself: `git ls-remote --symref origin HEAD` answers
 * `ref: refs/heads/<name>\tHEAD` on any host. It never prompts (terminal prompts off, askpass a
 * program that fails) and is cut off after `timeoutMs`. Any failure returns undefined.
 */
async function getDefaultBranchFromHost(
  runShellCommand: RunShellCommand,
  projectRoot: string,
  timeoutMs: number
): Promise<string | undefined> {
  try {
    const answer = await runShellCommand({
      command: 'git ls-remote --symref origin HEAD',
      projectRoot,
      env: PROMPT_OFF_ENV,
      timeoutMs,
    });
    const line = answer.split('\n').find((candidate) => candidate.startsWith('ref: refs/heads/'));
    const branch = line?.split('\t')[0].replace('ref: refs/heads/', '').trim();
    return branch ? branch : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the repository's default branch, most authoritative rung first:
 *
 * 1. **GitHub Actions event payload** - `repository.default_branch`, the
 *    platform's own answer (see {@link getDefaultBranchFromGitHubEvent}).
 * 2. **`git symbolic-ref refs/remotes/origin/HEAD`** - the generic, host-
 *    agnostic local record. A normal `git clone` writes it; shallow or
 *    `--single-branch` CI clones often lack it, and then the command fails.
 * 3. **`git ls-remote --symref origin HEAD`** - asks the team's own git host, on any host
 *    (see {@link getDefaultBranchFromHost}).
 * 4. **undefined** - no source answered. We never fall back to a guess
 *    like "main"/"master": a wrong main line is worse for the server than no
 *    main line, which it can simply treat as unknown.
 */
export default async function getDefaultBranch(
  runShellCommand: RunShellCommand,
  projectRoot: string,
  hostTimeoutMs: number = HOST_ASK_TIMEOUT_MS
): Promise<string | undefined> {
  const fromEvent = getDefaultBranchFromGitHubEvent();
  if (fromEvent) return fromEvent;

  try {
    // e.g. "refs/remotes/origin/main" -> "main"
    const ref = await runShellCommand({
      command: 'git symbolic-ref refs/remotes/origin/HEAD',
      projectRoot,
    });
    const branch = ref.trim().replace(/^refs\/remotes\/origin\//, '');
    if (branch.length > 0 && branch !== ref.trim()) return branch;
  } catch {
    // No local origin/HEAD: the git host is asked next.
  }

  return getDefaultBranchFromHost(runShellCommand, projectRoot, hostTimeoutMs);
}
