import { GitInfo } from '../getGitInfo';
import runShellCommand from '../runShellCommand';
import { checkStoryImportsStory } from './storyImportsStory';

export type ChangedFilesResult =
  | { changedFiles: string[] }
  | { fullRun: true; reason: string };

/**
 * Derives the list of changed files to send in the openBuild TurboSnap payload.
 *
 * Returns changedFiles when it is safe to do so, or { fullRun, reason } when
 * any condition prevents a sound partial selection:
 *
 * - Shallow clone: ancestry is grafted, diff base is untrustworthy.
 * - Dirty working tree: uncommitted changes invalidate the diff.
 * - Not on a PR merge ref: no mergeBaseSha available, cannot derive a safe base.
 *
 * When changedFiles is returned it is computed as:
 *   git diff --name-only <mergeBaseSha> <commitHash>
 * i.e. all files that changed on the feature branch since the fork point.
 *
 * THE FRONTIER MATCH REQUIREMENT (conservatism invariant):
 * The API resolves the frozen ancestry frontier server-side. For the diff to be
 * sound the frontier MUST equal gitInfo.mergeBaseSha (the fork point). If the
 * frontier is an older commit, this diff is a strict subset of what changed since
 * the frontier, which could miss visual regressions.
 *
 * REQUIRED API-SIDE VALIDATION: The API must cross-check
 *   resolvedFrontier.commitHash == gitInfo.mergeBaseSha
 * before accepting changedFiles for partial selection. If they differ the API
 * MUST bail to FULL capture (same as missing changedFiles). This validation
 * ensures that the client's diff base and the server's frontier always agree,
 * making the superset invariant hold even when a build does not exist at the
 * exact fork point.
 *
 * Until the API enforces this check the conservative direction is preserved
 * because a superset of affected stories is always safe (more captures, never
 * fewer). The only risk is from a subset, which requires a mismatch that the
 * API validation will prevent once implemented.
 */
export async function computeChangedFiles(
  projectRoot: string,
  gitInfo: GitInfo,
  opts: { forceFullRun?: boolean } = {}
): Promise<ChangedFilesResult> {
  if (opts.forceFullRun) {
    return { fullRun: true, reason: 'fullRun option set' };
  }

  if (gitInfo.isShallow) {
    return { fullRun: true, reason: 'shallow clone: ancestry is grafted, diff base is untrustworthy' };
  }

  if (gitInfo.isDirty) {
    return { fullRun: true, reason: 'dirty working tree: uncommitted changes invalidate the diff' };
  }

  const { mergeBaseSha, commitHash } = gitInfo;

  if (!mergeBaseSha) {
    return { fullRun: true, reason: 'not on a PR merge ref: no fork point available to diff from' };
  }

  try {
    const output = await runShellCommand({
      command: `git diff --name-only ${mergeBaseSha} ${commitHash}`,
      projectRoot,
    });
    const changedFiles = output.split('\n').filter(Boolean);
    return checkStoryImportsStory(projectRoot, changedFiles);
  } catch (err) {
    return { fullRun: true, reason: `git diff failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
