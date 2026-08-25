import fs from 'fs';
import { Build } from '@sherlo/api-types';
import runShellCommand from './runShellCommand';
import { emit } from './transcriptSink';

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
   * `refs/pull/N/merge` commit or a GitHub merge-queue ref) `commitHash` is
   * canonicalised to the real PR-head SHA (the second parent of the merge
   * commit). This field carries that same PR-head SHA and acts as the
   * server-side SIGNAL that the build originated from a synthetic merge ref –
   * without it a canonicalised commit is indistinguishable from a direct push
   * to the same SHA.
   */
  prHeadCommitHash?: string;
  /** Direct parent SHAs of the canonical commit, newest first. */
  parentCommitHashes?: string[];
  /**
   * Bounded first-parent ancestry of the canonical commit, newest first,
   * excluding the commit itself. Capped at {@link ANCESTOR_LIMIT} entries.
   */
  ancestorCommitHashes?: string[];
  /**
   * Per-parent first-parent ancestry windows for non-first parents of the
   * canonical commit (i.e. parents[1], parents[2], …). The outer array is
   * index-aligned with `parentCommitHashes.slice(1)`.  Each inner array is
   * bounded at {@link ANCESTOR_LIMIT} entries.
   *
   * Only present when the canonical commit is a merge commit.
   */
  perParentAncestorCommitHashes?: string[][];
  /**
   * True fork-point between the PR branch and the base branch, computed as
   * `git merge-base HEAD^1 HEAD^2` on a synthetic merge ref.  This is the
   * common ancestor at the time the PR was created and differs from the
   * base-branch tip whenever the base has advanced since the PR forked.
   */
  mergeBaseSha?: string;
  /** Normalised `owner/repo` slug derived from the `origin` remote URL. */
  repoSlug?: string;
  /** Whether the repository is a shallow clone (e.g. `clone --depth 1`). */
  isShallow?: boolean;
  /** Whether the working tree has uncommitted changes. */
  isDirty?: boolean;
  /**
   * The repository's DEFAULT branch (its main line), bare - e.g. `main`.
   *
   * This is the repository-level fact ("which branch is this project's trunk"),
   * never the branch being built ({@link GitInfo.branchName}). It lets the
   * server infer a project's main line instead of guessing at a name.
   *
   * Captured on a best-effort basis and omitted - never guessed - when no
   * source answers. See {@link getDefaultBranch} for each rung's honesty.
   */
  defaultBranch?: string;
};

/** Maximum number of ancestor SHAs captured per ancestry window. */
export const ANCESTOR_LIMIT = 200;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the current HEAD is a CI-provided synthetic merge commit:
 *
 * - **refs/pull/N/merge** – GitHub Actions `pull_request` event (GITHUB_REF_NAME = "N/merge")
 * - **merge_group** – GitHub merge queue (GITHUB_REF_NAME starts with "gh-readonly-queue/")
 */
function isPullRequestMergeRef(): boolean {
  const refName = process.env.GITHUB_REF_NAME;
  if (!refName) return false;
  return /^\d+\/merge$/.test(refName) || refName.startsWith('gh-readonly-queue/');
}

/**
 * The real PR-head SHA reported directly by GitHub Actions, independent of the
 * local clone depth.
 *
 * On a `pull_request` event GitHub writes the triggering event's JSON payload to
 * the file named by `GITHUB_EVENT_PATH`, and `pull_request.head.sha` in that
 * payload is the tip of the PR branch - exactly the second parent (HEAD^2) of
 * the synthetic `refs/pull/N/merge` commit. We read it as a shallow-clone-proof
 * source for the PR head: on GitHub's default fetch-depth:1 checkout the merge
 * commit's parents are grafted away, so `git rev-parse HEAD^2` can't recover
 * this SHA locally. Returns undefined when the file or field is absent (e.g. a
 * merge_group event, which carries no PR head).
 */
function getPrHeadShaFromGitHubEvent(): string | undefined {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return undefined;
  try {
    const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const sha = payload?.pull_request?.head?.sha;
    return typeof sha === 'string' && sha.length > 0 ? sha : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The repository's default branch as reported by GitHub Actions.
 *
 * The runner writes the triggering event's JSON payload to the file named by
 * `GITHUB_EVENT_PATH` - the same road {@link getPrHeadShaFromGitHubEvent}
 * travels - and MOST events (push, pull_request, workflow_dispatch, …) embed
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
 * Resolves the repository's default branch, most authoritative rung first:
 *
 * 1. **GitHub Actions event payload** - `repository.default_branch`, the
 *    platform's own answer (see {@link getDefaultBranchFromGitHubEvent}).
 * 2. **`git symbolic-ref refs/remotes/origin/HEAD`** - the generic, host-
 *    agnostic fallback. That ref is written by a normal `git clone` and points
 *    at the remote's HEAD, so on a full clone it is an honest local record of
 *    the default branch. It is ABSENT on many CI checkouts (shallow or
 *    `--single-branch` clones fetch no such ref, and `actions/checkout` never
 *    writes one), in which case the command fails.
 * 3. **undefined** - neither source answered. We never fall back to a guess
 *    like "main"/"master": a wrong main line is worse for the server than no
 *    main line, which it can simply treat as unknown.
 */
async function getDefaultBranch(projectRoot: string): Promise<string | undefined> {
  const fromEvent = getDefaultBranchFromGitHubEvent();
  if (fromEvent) return fromEvent;

  try {
    // e.g. "refs/remotes/origin/main" -> "main"
    const ref = await runShellCommand({
      command: 'git symbolic-ref refs/remotes/origin/HEAD',
      projectRoot,
    });
    const branch = ref.trim().replace(/^refs\/remotes\/origin\//, '');
    return branch.length > 0 && branch !== ref.trim() ? branch : undefined;
  } catch {
    return undefined;
  }
}

/**
 * For a `merge_group` ref (`gh-readonly-queue/<base>/<pr-spec>`) returns the
 * base branch name, otherwise undefined.
 */
function getMergeGroupBaseBranch(refName: string): string | undefined {
  const match = refName.match(/^gh-readonly-queue\/([^/]+)\//);
  return match?.[1];
}

/**
 * Returns true for a value that is present but should be treated as
 * branch-absent (e.g. a CI placeholder like "merge").
 */
function isBranchAbsent(value: string | undefined): boolean {
  return !value || value === 'merge';
}

/**
 * Resolves the branch name using a strict precedence chain:
 *
 * 1. Explicit caller-supplied override (--git-branch flag)
 * 2. SHERLO_BRANCH env var
 * 3. CI-provider env vars (Bitrise → CircleCI → GitLab → Codemagic → Azure)
 * 4. merge_group base-branch extracted from GITHUB_REF_NAME
 * 5. GITHUB_HEAD_REF (PR source branch on pull_request events)
 * 6. GITHUB_REF_NAME (skipped when it encodes a merge ref like "N/merge")
 * 7. git rev-parse --abbrev-ref HEAD (detached HEAD → "HEAD")
 */
async function resolveBranchName(projectRoot: string, branchOverride?: string): Promise<string> {
  // 1. --git-branch flag
  if (branchOverride) return branchOverride;

  // 2. SHERLO_BRANCH
  const sherloBranch = process.env.SHERLO_BRANCH;
  if (!isBranchAbsent(sherloBranch)) return sherloBranch!;

  // 3a. Bitrise
  const bitriseBranch = process.env.BITRISE_GIT_BRANCH;
  if (!isBranchAbsent(bitriseBranch)) return bitriseBranch!;

  // 3b. CircleCI
  const circleBranch = process.env.CIRCLE_BRANCH;
  if (!isBranchAbsent(circleBranch)) return circleBranch!;

  // 3c. GitLab CI
  const gitlabBranch = process.env.CI_COMMIT_REF_NAME;
  if (!isBranchAbsent(gitlabBranch)) return gitlabBranch!;

  // 3d. Codemagic
  const codemagicBranch = process.env.CM_BRANCH;
  if (!isBranchAbsent(codemagicBranch)) return codemagicBranch!;

  // 3e. Azure DevOps: SYSTEM_PULLREQUEST_SOURCEBRANCH preferred in PR context,
  // BUILD_SOURCEBRANCH otherwise. Both may carry a "refs/heads/" prefix that
  // must be stripped to get a bare branch name.
  const azurePrBranch = process.env.SYSTEM_PULLREQUEST_SOURCEBRANCH;
  if (azurePrBranch) {
    const stripped = azurePrBranch.replace(/^refs\/heads\//, '');
    if (!isBranchAbsent(stripped)) return stripped;
  }
  const azureBranch = process.env.BUILD_SOURCEBRANCH;
  if (azureBranch) {
    const stripped = azureBranch.replace(/^refs\/heads\//, '');
    if (!isBranchAbsent(stripped)) return stripped;
  }

  const githubRefName = process.env.GITHUB_REF_NAME;

  // 4. merge_group: extract the base branch from the ref name
  if (githubRefName) {
    const mergeGroupBase = getMergeGroupBaseBranch(githubRefName);
    if (mergeGroupBase) return mergeGroupBase;
  }

  // 5. GITHUB_HEAD_REF (PR source branch on pull_request events)
  const githubHeadRef = process.env.GITHUB_HEAD_REF;
  if (githubHeadRef) return githubHeadRef;

  // 6. GITHUB_REF_NAME (skip PR merge refs like "123/merge")
  if (githubRefName && !githubRefName.includes('/merge')) return githubRefName;

  // 7. git fallback (detached HEAD yields "HEAD")
  return await runShellCommand({
    command: 'git rev-parse --abbrev-ref HEAD',
    projectRoot,
  });
}

/**
 * Best-effort capture of additive git fields. Each field is resolved
 * independently and silently dropped on failure so that a single unsupported
 * sub-command can never compromise the base payload.
 *
 * When HEAD is a CI synthetic merge commit (PR merge ref or merge_group),
 * **all** commit-identity fields are canonicalised to the real PR head (the
 * second parent).  This ensures that `commitHash`, `parentCommitHashes`, and
 * `ancestorCommitHashes` describe the PR author's work, not the ephemeral
 * merge commit that CI creates.
 */
async function getAdditionalGitInfo(
  projectRoot: string
): Promise<{ additional: Partial<GitInfo>; canonicalSha?: string }> {
  const additional: Partial<GitInfo> = {};

  const safe = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch {
      // Additive field - leave it undefined and carry on.
    }
  };

  // Resolves a git revision to its SHA, returning undefined instead of throwing
  // when the revision can't be resolved (e.g. HEAD^2 on a shallow clone whose
  // parent objects were grafted away).
  const safeRevParse = async (rev: string): Promise<string | undefined> => {
    try {
      return await runShellCommand({ command: `git rev-parse ${rev}`, projectRoot });
    } catch {
      return undefined;
    }
  };

  const onMergeRef = isPullRequestMergeRef();

  // On a synthetic merge-ref checkout, resolve the REAL PR head.
  //
  // The PR head is the second parent (HEAD^2) of the merge commit. On a full
  // clone `git rev-parse HEAD^2` returns it directly. On GitHub's DEFAULT
  // fetch-depth:1 shallow checkout the parent objects are grafted away and that
  // command fails, so we fall back to the PR-head SHA GitHub records in the
  // pull_request event payload.
  //
  // `prHeadCommitHash` must carry the real PR head in BOTH cases: the server
  // keys the commit-hash GSI on it, so a wrong value (e.g. the ephemeral merge
  // SHA) makes an approved PR build invisible to later builds. It also signals
  // that this build originates from a synthetic merge ref - without it a
  // canonicalised commitHash is indistinguishable from a direct push.
  //
  // `canonicalSha` anchors the LOCAL ancestry queries below. We only set it when
  // the PR head actually exists in this clone (deep clone); on a shallow clone
  // it stays undefined so those queries run against HEAD and degrade gracefully
  // instead of failing on a grafted-away object.
  let canonicalSha: string | undefined;
  if (onMergeRef) {
    const localPrHead = await safeRevParse('HEAD^2');
    const prHead = localPrHead ?? getPrHeadShaFromGitHubEvent();
    if (prHead) additional.prHeadCommitHash = prHead;
    canonicalSha = localPrHead;
  }

  // Parent SHAs of the canonical commit.
  await safe(async () => {
    const target = canonicalSha ?? 'HEAD';
    const parents = await runShellCommand({
      command: `git log -1 --pretty=format:%P ${target}`,
      projectRoot,
    });
    const parentCommitHashes = parents.split(' ').filter(Boolean);
    if (parentCommitHashes.length > 0) {
      additional.parentCommitHashes = parentCommitHashes;
    }
  });

  // First-parent ancestor chain of the canonical commit.
  await safe(async () => {
    const target = canonicalSha ?? 'HEAD';
    const ancestors = await runShellCommand({
      command: `git rev-list --first-parent --skip=1 --max-count=${ANCESTOR_LIMIT} ${target}`,
      projectRoot,
    });
    const ancestorCommitHashes = ancestors.split('\n').filter(Boolean);
    if (ancestorCommitHashes.length > 0) {
      additional.ancestorCommitHashes = ancestorCommitHashes;
    }
  });

  // Per-parent first-parent windows for non-first parents (merge commits).
  await safe(async () => {
    const parents = additional.parentCommitHashes;
    if (!parents || parents.length < 2) return;
    const windows: string[][] = [];
    for (const parentSha of parents.slice(1)) {
      try {
        const out = await runShellCommand({
          command: `git rev-list --first-parent --skip=1 --max-count=${ANCESTOR_LIMIT} ${parentSha}`,
          projectRoot,
        });
        windows.push(out.split('\n').filter(Boolean));
      } catch {
        windows.push([]);
      }
    }
    if (windows.length > 0) {
      additional.perParentAncestorCommitHashes = windows;
    }
  });

  // mergeBaseSha: true fork-point between PR branch and base branch.
  // `git merge-base HEAD^1 HEAD^2` finds the common ancestor at the time the
  // PR was created, which differs from HEAD^1 (base-branch tip) whenever the
  // base has advanced since the PR forked.
  await safe(async () => {
    if (onMergeRef) {
      additional.mergeBaseSha = await runShellCommand({
        command: 'git merge-base HEAD^1 HEAD^2',
        projectRoot,
      });
    }
  });

  // repoSlug: normalised "owner/repo" from the origin remote URL.
  await safe(async () => {
    const remoteUrl = await runShellCommand({
      command: 'git remote get-url origin',
      projectRoot,
    });
    const slug = parseRepoSlug(remoteUrl);
    if (slug) additional.repoSlug = slug;
  });

  await safe(async () => {
    const isShallow = await runShellCommand({
      command: 'git rev-parse --is-shallow-repository',
      projectRoot,
    });
    additional.isShallow = isShallow.trim() === 'true';
  });

  // defaultBranch: the repository's main line (NOT the branch being built).
  await safe(async () => {
    const defaultBranch = await getDefaultBranch(projectRoot);
    if (defaultBranch) additional.defaultBranch = defaultBranch;
  });

  await safe(async () => {
    const status = await runShellCommand({
      command: 'git status --porcelain',
      projectRoot,
    });
    additional.isDirty = status.trim().length > 0;
  });

  return { additional, canonicalSha };
}

/**
 * Parses an `owner/repo` slug out of any common git remote URL format.
 *
 * Handles HTTPS (`https://host/owner/repo.git`) and SSH
 * (`git@host:owner/repo.git`) forms, host-agnostic.
 */
function parseRepoSlug(remoteUrl: string): string | undefined {
  // SSH: git@host:owner/repo.git
  const sshMatch = remoteUrl.match(/^[^@]+@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  // HTTPS: https://host/owner/repo.git or http://host/owner/repo
  const httpsMatch = remoteUrl.match(/^https?:\/\/[^/]+\/([^/]+\/[^/]+?)(?:\.git)?(?:\/)?$/);
  if (httpsMatch) return httpsMatch[1];
  return undefined;
}

async function getGitInfo(
  projectRoot: string,
  opts?: { branchOverride?: string }
): Promise<GitInfo> {
  try {
    const { additional, canonicalSha } = await getAdditionalGitInfo(projectRoot);

    const commitHash = canonicalSha
      ? canonicalSha
      : await runShellCommand({ command: 'git rev-parse HEAD', projectRoot });

    const commitName = await runShellCommand({
      command: 'git log -1 --pretty=format:%s ' + (canonicalSha ?? 'HEAD'),
      projectRoot,
    });

    const branchName = await resolveBranchName(projectRoot, opts?.branchOverride);

    return { commitName, commitHash, branchName, ...additional };
  } catch (error) {
    return degradeGitInfo(error);
  }
}

/**
 * The git read failed: warn, and carry on with unknown commit/branch. The CLI
 * never fails a run over this.
 *
 * Exported because it is BOTH halves of one behaviour - the warn a user sees and
 * the values everything downstream then works from - and a scenario that scripts
 * "this project has no git" must produce both, from here, rather than from a
 * second author's idea of them.
 */
export function degradeGitInfo(error: unknown): GitInfo {
  emit({ kind: 'git-info-unavailable', error });

  return {
    commitName: 'unknown',
    commitHash: 'unknown',
    branchName: 'unknown',
  };
}

export default getGitInfo;
