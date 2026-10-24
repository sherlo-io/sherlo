import type runShellCommandType from './runShellCommand';

/** The shell runner, handed in by getGitInfo, which owns the shell. */
type RunShellCommand = typeof runShellCommandType;

/**
 * First-parent windows (each at most `limit` hashes, newest first, the parent itself skipped) for
 * every parent in `parents`, in the order given. A window git cannot read is empty.
 */
export async function readParentWindows(
  runShellCommand: RunShellCommand,
  projectRoot: string,
  parents: string[],
  limit: number
): Promise<string[][]> {
  const windows: string[][] = [];
  for (const parentSha of parents) {
    try {
      const out = await runShellCommand({
        command: `git rev-list --first-parent --skip=1 --max-count=${limit} ${parentSha}`,
        projectRoot,
      });
      windows.push(out.split('\n').filter(Boolean));
    } catch {
      windows.push([]);
    }
  }
  return windows;
}

/**
 * For every merge commit in the history a push sends - the first-parent chains from `tips`, each
 * bounded at `limit` - one list: the merge's hash, then its non-first parents. One
 * `git rev-list --parents` over all the tips, never one call per commit. Empty when no merge is
 * in that history.
 */
export async function readMergedParents(
  runShellCommand: RunShellCommand,
  projectRoot: string,
  tips: string[],
  limit: number
): Promise<string[][]> {
  const out = await runShellCommand({
    command: `git rev-list --parents --first-parent --max-count=${limit * tips.length} ${tips.join(' ')}`,
    projectRoot,
  });
  const merges: string[][] = [];
  for (const line of out.split('\n')) {
    const [hash, , ...otherParents] = line.trim().split(' ');
    if (hash && otherParents.length > 0) merges.push([hash, ...otherParents]);
  }
  return merges;
}
