import { Build } from '@sherlo/api-types';
import runShellCommand from './runShellCommand';

/**
 * Git metadata captured for a build.
 *
 * The first three fields ({@link GitInfo.branchName}, {@link GitInfo.commitHash},
 * {@link GitInfo.commitName}) are the historical, always-present payload. Every
 * other field is OPTIONAL and additive: it is captured on a best-effort basis
 * and is simply omitted when it can't be determined (older git, no PR context,
 * a failing sub-command, …). This keeps the payload backward compatible - an
 * old CLI sending only the three base fields (or the `'unknown'` sentinel)
 * remains a valid `GitInfo`/`Build['gitInfo']`.
 */
export type GitInfo = Build['gitInfo'] & {
  /**
   * On a pull-request *merge ref* checkout (e.g. GitHub Actions' synthetic
   * `refs/pull/N/merge` commit) `commitHash` points at the throw-away merge
   * commit. This field carries the *real* PR-head SHA instead - the second
   * parent of the merge commit.
   */
  prHeadCommitHash?: string;
  /** Direct parent SHAs of `HEAD` (two or more on a merge commit). */
  parentCommitHashes?: string[];
  /**
   * Bounded first-parent ancestry of `HEAD`, newest first, excluding `HEAD`
   * itself. Capped at {@link ANCESTOR_LIMIT} entries.
   */
  ancestorCommitHashes?: string[];
  /** Whether the repository is a shallow clone (e.g. `clone --depth 1`). */
  isShallow?: boolean;
  /** Whether the working tree has uncommitted changes. */
  isDirty?: boolean;
};

/** Maximum number of ancestor SHAs captured in {@link GitInfo.ancestorCommitHashes}. */
export const ANCESTOR_LIMIT = 20;

async function resolveBranchName(projectRoot: string): Promise<string> {
  // GitHub Actions: GITHUB_HEAD_REF is set on pull_request events (PR source branch)
  const githubHeadRef = process.env.GITHUB_HEAD_REF;
  if (githubHeadRef) return githubHeadRef;

  // GitHub Actions: GITHUB_REF_NAME is set on all events (branch/tag name)
  // On PR events it contains "123/merge" which is not a real branch, so skip those
  const githubRefName = process.env.GITHUB_REF_NAME;
  if (githubRefName && !githubRefName.includes('/merge')) return githubRefName;

  // Local git / fallback
  return await runShellCommand({
    command: 'git rev-parse --abbrev-ref HEAD',
    projectRoot,
  });
}

/**
 * Detects whether we're sitting on a CI-provided pull-request *merge ref*.
 *
 * On `pull_request` events GitHub checks out a synthetic merge commit and sets
 * `GITHUB_REF_NAME` to `"<number>/merge"`. In that situation `HEAD` is the merge
 * commit and its second parent is the actual PR head.
 */
function isPullRequestMergeRef(): boolean {
  const githubRefName = process.env.GITHUB_REF_NAME;
  return !!githubRefName && githubRefName.includes('/merge');
}

/**
 * Best-effort capture of the additive git fields. Each field is resolved
 * independently and silently dropped on failure so that a single unsupported
 * sub-command can never compromise the base payload.
 */
async function getAdditionalGitInfo(projectRoot: string): Promise<Partial<GitInfo>> {
  const additional: Partial<GitInfo> = {};

  const safe = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch {
      // Additive field - leave it undefined and carry on.
    }
  };

  await safe(async () => {
    // %P lists the full parent SHAs separated by spaces (empty for the root commit).
    const parents = await runShellCommand({
      command: 'git log -1 --pretty=format:%P',
      projectRoot,
    });
    const parentCommitHashes = parents.split(' ').filter(Boolean);
    if (parentCommitHashes.length > 0) {
      additional.parentCommitHashes = parentCommitHashes;

      // On a PR merge ref the second parent is the real PR-head commit.
      if (isPullRequestMergeRef() && parentCommitHashes.length >= 2) {
        additional.prHeadCommitHash = parentCommitHashes[1];
      }
    }
  });

  await safe(async () => {
    const ancestors = await runShellCommand({
      command: `git rev-list --first-parent --skip=1 --max-count=${ANCESTOR_LIMIT} HEAD`,
      projectRoot,
    });
    const ancestorCommitHashes = ancestors.split('\n').filter(Boolean);
    if (ancestorCommitHashes.length > 0) {
      additional.ancestorCommitHashes = ancestorCommitHashes;
    }
  });

  await safe(async () => {
    const isShallow = await runShellCommand({
      command: 'git rev-parse --is-shallow-repository',
      projectRoot,
    });
    additional.isShallow = isShallow.trim() === 'true';
  });

  await safe(async () => {
    const status = await runShellCommand({
      command: 'git status --porcelain',
      projectRoot,
    });
    additional.isDirty = status.trim().length > 0;
  });

  return additional;
}

async function getGitInfo(projectRoot: string): Promise<GitInfo> {
  try {
    const commitName = await runShellCommand({
      command: 'git log -1 --pretty=format:%s',
      projectRoot,
    });
    const commitHash = await runShellCommand({ command: 'git rev-parse HEAD', projectRoot });
    const branchName = await resolveBranchName(projectRoot);

    const additional = await getAdditionalGitInfo(projectRoot);

    return { commitName, commitHash, branchName, ...additional };
  } catch (error) {
    console.warn("Couldn't get git info", error);

    return {
      commitName: 'unknown',
      commitHash: 'unknown',
      branchName: 'unknown',
    };
  }
}

export default getGitInfo;
