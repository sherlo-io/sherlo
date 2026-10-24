import { HOST_ASK_TIMEOUT_MS, PROMPT_OFF_ENV } from './getDefaultBranch';
import gitFailureReason from './gitFailureReason';
import type runShellCommandType from './runShellCommand';

/**
 * The shell runner, handed in by getGitInfo (the live half that owns the shell): this file asks
 * git through it, it does not reach the shell on its own.
 */
type RunShellCommand = typeof runShellCommandType;

/** What {@link deepenShallowClone} did: `refused` carries git's own reason. */
export type DeepenResult =
  | { kind: 'untouched' }
  | { kind: 'deepened' }
  | { kind: 'refused'; reason: string };

/**
 * Fetches `commits` more commits of history (getGitInfo hands in its ANCESTOR_LIMIT) into a shallow clone - the depth the push
 * sends - so the history it reads is there to read. A full clone, or a folder git cannot read, is
 * left untouched. The fetch never prompts and is cut off after the host-ask time; when git refuses
 * it, git's reason comes back and the push goes on.
 */
export default async function deepenShallowClone(
  runShellCommand: RunShellCommand,
  projectRoot: string,
  commits: number
): Promise<DeepenResult> {
  try {
    const shallow = await runShellCommand({
      command: 'git rev-parse --is-shallow-repository',
      projectRoot,
    });
    if (shallow.trim() !== 'true') return { kind: 'untouched' };
  } catch {
    // Not a repository git can read: the git read reports that itself.
    return { kind: 'untouched' };
  }

  try {
    await runShellCommand({
      command: `git fetch --no-tags --deepen=${commits}`,
      projectRoot,
      env: PROMPT_OFF_ENV,
      timeoutMs: HOST_ASK_TIMEOUT_MS,
    });
    return { kind: 'deepened' };
  } catch (error) {
    // One line: the warning prints the reason inside a single sentence.
    return { kind: 'refused', reason: gitFailureReason(error).replace(/\s*\r?\n\s*/g, ' ') };
  }
}
