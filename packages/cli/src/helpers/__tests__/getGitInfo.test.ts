import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import getGitInfo, { ANCESTOR_LIMIT } from '../getGitInfo';
import GitFixture from './support/gitFixture';

/**
 * Real-git tests for getGitInfo, driven by the deterministic {@link GitFixture}
 * harness. No git commands are mocked - these exercise the actual sub-commands
 * getGitInfo relies on.
 */

let fixture: GitFixture;

// getGitInfo reads env vars from several CI providers; neutralise all of them
// so the suite is stable whether it runs locally or inside any CI environment.
const GIT_ENV_KEYS = [
  'GITHUB_HEAD_REF',
  'GITHUB_REF_NAME',
  'SHERLO_BRANCH',
  'BITRISE_GIT_BRANCH',
  'CIRCLE_BRANCH',
  'CI_COMMIT_REF_NAME',
  'CM_BRANCH',
  'BUILD_SOURCEBRANCH',
  'SYSTEM_PULLREQUEST_SOURCEBRANCH',
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of GIT_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined as unknown as GitFixture;
  for (const key of GIT_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

// ---------------------------------------------------------------------------
// Base payload
// ---------------------------------------------------------------------------

describe('getGitInfo - base payload', () => {
  it('captures branchName, commitHash and commitName for a simple repo', async () => {
    fixture = GitFixture.create();
    const sha = fixture.commitFile('initial commit');

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('main');
    expect(info.commitHash).toBe(sha);
    expect(info.commitName).toBe('initial commit');
  });

  it('reports a clean, non-shallow repo and omits ancestry fields for a root commit', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('only commit');

    const info = await getGitInfo(fixture.dir);

    expect(info.isShallow).toBe(false);
    expect(info.isDirty).toBe(false);
    // Root commit has no parents -> these additive fields are omitted.
    expect(info.parentCommitHashes).toBeUndefined();
    expect(info.ancestorCommitHashes).toBeUndefined();
    // Not on a merge ref -> prHeadCommitHash absent.
    expect(info.prHeadCommitHash).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Parents and ancestors
// ---------------------------------------------------------------------------

describe('getGitInfo - parents and ancestors', () => {
  it('captures the single parent and the bounded ancestor chain', async () => {
    fixture = GitFixture.create();
    const c1 = fixture.commitFile('c1');
    const c2 = fixture.commitFile('c2');
    const c3 = fixture.commitFile('c3');

    const info = await getGitInfo(fixture.dir);

    expect(info.commitHash).toBe(c3);
    expect(info.parentCommitHashes).toEqual([c2]);
    // First-parent ancestry of HEAD, excluding HEAD itself, newest first.
    expect(info.ancestorCommitHashes).toEqual([c2, c1]);
  });

  it('bounds the ancestor list to ANCESTOR_LIMIT (200) entries', async () => {
    fixture = GitFixture.create();
    for (let i = 0; i <= ANCESTOR_LIMIT + 5; i++) {
      fixture.commitFile(`commit ${i}`);
    }

    const info = await getGitInfo(fixture.dir);

    expect(ANCESTOR_LIMIT).toBe(200);
    expect(info.ancestorCommitHashes).toHaveLength(ANCESTOR_LIMIT);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// PR merge ref – canonicalisation
// ---------------------------------------------------------------------------

describe('getGitInfo - PR merge ref (refs/pull/N/merge)', () => {
  it('sets commitHash to the PR head (second parent), not the synthetic merge commit', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('base on main');

    fixture.branch('feature', { checkout: true });
    const prHead = fixture.commitFile('pr head commit', 'feature.txt');

    fixture.checkout('main');
    const mergeSha = fixture.merge('feature');
    fixture.detach(mergeSha);

    process.env.GITHUB_REF_NAME = '123/merge';

    const info = await getGitInfo(fixture.dir);

    // commitHash must be the real PR head, not the synthetic merge commit.
    expect(info.commitHash).toBe(prHead);
    expect(info.commitHash).not.toBe(mergeSha);
  });

  it('sets parentCommitHashes and ancestorCommitHashes relative to the PR head', async () => {
    fixture = GitFixture.create();
    const base = fixture.commitFile('base on main');

    fixture.branch('feature', { checkout: true });
    const prHead = fixture.commitFile('pr head commit', 'feature.txt');

    fixture.checkout('main');
    const mergeSha = fixture.merge('feature');
    fixture.detach(mergeSha);

    process.env.GITHUB_REF_NAME = '123/merge';

    const info = await getGitInfo(fixture.dir);

    // PR head's parent is `base`, NOT [base, prHead] (those are the merge's parents).
    expect(info.parentCommitHashes).toEqual([base]);
    // PR head's first-parent ancestry also leads to `base`.
    expect(info.ancestorCommitHashes).toEqual([base]);
  });

  it('sets prHeadCommitHash to the PR head SHA as a merge-ref signal', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('base on main');

    fixture.branch('feature', { checkout: true });
    const prHead = fixture.commitFile('pr head', 'feature.txt');

    fixture.checkout('main');
    const mergeSha = fixture.merge('feature');
    fixture.detach(mergeSha);

    process.env.GITHUB_REF_NAME = '42/merge';

    const info = await getGitInfo(fixture.dir);

    // prHeadCommitHash signals to the server that this is a synthetic merge ref.
    expect(info.prHeadCommitHash).toBe(prHead);
    // commitHash is also the PR head (canonicalised).
    expect(info.commitHash).toBe(prHead);
  });

  it('computes mergeBaseSha as the true fork-point, not the base-branch tip', async () => {
    fixture = GitFixture.create();
    const forkPoint = fixture.commitFile('fork point');

    // Feature branch forks from forkPoint.
    fixture.branch('feature', { checkout: true });
    fixture.commitFile('pr head', 'feature.txt');

    // Main advances AFTER the fork (so base tip != fork point).
    fixture.checkout('main');
    const baseTip = fixture.commitFile('base advances after fork');

    // Create the synthetic merge commit.
    const mergeSha = fixture.merge('feature');
    fixture.detach(mergeSha);

    process.env.GITHUB_REF_NAME = '7/merge';

    const info = await getGitInfo(fixture.dir);

    // The true fork-point is `forkPoint`, not `baseTip`.
    expect(info.mergeBaseSha).toBe(forkPoint);
    expect(info.mergeBaseSha).not.toBe(baseTip);
  });

  it('does not canonicalise for a normal merge outside a PR merge ref env', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('base on main');
    fixture.branch('feature', { checkout: true });
    fixture.commitFile('pr head commit', 'feature.txt');
    fixture.checkout('main');
    const mergeSha = fixture.merge('feature');

    // No GITHUB_REF_NAME set -> not a PR merge ref.
    const info = await getGitInfo(fixture.dir);

    expect(info.commitHash).toBe(mergeSha);
    expect(info.prHeadCommitHash).toBeUndefined();
    expect(info.mergeBaseSha).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// merge_group canonicalisation
// ---------------------------------------------------------------------------

describe('getGitInfo - merge_group (gh-readonly-queue)', () => {
  it('canonicalises commitHash to the PR head (second parent)', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('base on main');

    fixture.branch('feature', { checkout: true });
    const prHead = fixture.commitFile('merge queue pr head', 'feature.txt');

    fixture.checkout('main');
    const mergeSha = fixture.merge('feature');
    fixture.detach(mergeSha);

    process.env.GITHUB_REF_NAME = 'gh-readonly-queue/main/pr-7-abc123';

    const info = await getGitInfo(fixture.dir);

    expect(info.commitHash).toBe(prHead);
    expect(info.commitHash).not.toBe(mergeSha);
  });

  it('sets prHeadCommitHash to the PR head SHA for merge_group refs', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('base');
    fixture.branch('feature', { checkout: true });
    const prHead = fixture.commitFile('pr head', 'f.txt');
    fixture.checkout('main');
    const mergeSha = fixture.merge('feature');
    fixture.detach(mergeSha);

    process.env.GITHUB_REF_NAME = 'gh-readonly-queue/main/pr-7-abc123';

    const info = await getGitInfo(fixture.dir);

    expect(info.prHeadCommitHash).toBe(prHead);
  });

  it('resolves branchName to the base branch extracted from the ref', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('base');
    fixture.branch('feature', { checkout: true });
    fixture.commitFile('pr head', 'f.txt');
    fixture.checkout('main');
    const mergeSha = fixture.merge('feature');
    fixture.detach(mergeSha);

    process.env.GITHUB_REF_NAME = 'gh-readonly-queue/main/pr-7-abc123';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('main');
  });

  it('omits prHeadCommitHash on a plain (non-merge-ref) checkout', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');

    const info = await getGitInfo(fixture.dir);

    expect(info.prHeadCommitHash).toBeUndefined();
  });

  it('sets parentCommitHashes and ancestorCommitHashes relative to the PR head', async () => {
    fixture = GitFixture.create();
    const base = fixture.commitFile('base on main');

    fixture.branch('feature', { checkout: true });
    const prParent = fixture.commitFile('pr commit 1', 'f.txt');
    const prHead = fixture.commitFile('pr head', 'f.txt');

    fixture.checkout('main');
    const mergeSha = fixture.merge('feature');
    fixture.detach(mergeSha);

    process.env.GITHUB_REF_NAME = 'gh-readonly-queue/main/pr-42-abc';

    const info = await getGitInfo(fixture.dir);

    // Canonicalised to PR head – ancestry is relative to the real PR commit.
    expect(info.commitHash).toBe(prHead);
    // PR head's immediate parent is prParent, not the merge's [base, prHead].
    expect(info.parentCommitHashes).toEqual([prParent]);
    // First-parent ancestry of PR head: prParent → base.
    expect(info.ancestorCommitHashes).toEqual([prParent, base]);
  });

  it('degrades gracefully on a shallow clone of a merge_group ref (no crash, isShallow detected)', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('base on main');
    fixture.branch('feature', { checkout: true });
    fixture.commitFile('pr head', 'feature.txt');
    fixture.checkout('main');
    fixture.merge('feature');

    // Shallow clone at depth=1: merge commit is present but parent history is grafted away.
    const shallow = fixture.shallowClone(1, 'main');
    try {
      process.env.GITHUB_REF_NAME = 'gh-readonly-queue/main/pr-5-xyz';

      const info = await getGitInfo(shallow.dir);

      // Must not throw; base fields must always be present.
      expect(info.branchName).toBeDefined();
      expect(info.commitHash).toBeDefined();
      expect(info.commitName).toBeDefined();
      // Shallow clone is detected.
      expect(info.isShallow).toBe(true);
      // Deep ancestry is unavailable in a shallow clone – omitted rather than crashing.
      expect(info.ancestorCommitHashes).toBeUndefined();
    } finally {
      shallow.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Branch resolution precedence
// ---------------------------------------------------------------------------

describe('getGitInfo - branch resolution precedence', () => {
  it('explicit branchOverride (--git-branch flag) wins over all env vars', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.SHERLO_BRANCH = 'from-env';
    process.env.BITRISE_GIT_BRANCH = 'from-bitrise';
    process.env.GITHUB_HEAD_REF = 'from-github';

    const info = await getGitInfo(fixture.dir, { branchOverride: 'explicit-override' });

    expect(info.branchName).toBe('explicit-override');
  });

  it('SHERLO_BRANCH wins over provider env vars', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.SHERLO_BRANCH = 'sherlo-branch';
    process.env.BITRISE_GIT_BRANCH = 'from-bitrise';
    process.env.CIRCLE_BRANCH = 'from-circle';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('sherlo-branch');
  });

  it('treats bare "merge" value in SHERLO_BRANCH as absent', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.SHERLO_BRANCH = 'merge';
    process.env.BITRISE_GIT_BRANCH = 'from-bitrise';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('from-bitrise');
  });

  it('BITRISE_GIT_BRANCH is used when higher-priority signals absent', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.BITRISE_GIT_BRANCH = 'my-feature';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('my-feature');
  });

  it('CIRCLE_BRANCH wins over GitLab and below', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.CIRCLE_BRANCH = 'circle-feature';
    process.env.CI_COMMIT_REF_NAME = 'gitlab-branch';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('circle-feature');
  });

  it('CI_COMMIT_REF_NAME (GitLab) wins over Codemagic and below', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.CI_COMMIT_REF_NAME = 'gitlab-feature';
    process.env.CM_BRANCH = 'codemagic-branch';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('gitlab-feature');
  });

  it('CM_BRANCH (Codemagic) wins over Azure and below', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.CM_BRANCH = 'codemagic-feature';
    process.env.BUILD_SOURCEBRANCH = 'refs/heads/azure-branch';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('codemagic-feature');
  });

  it('SYSTEM_PULLREQUEST_SOURCEBRANCH (Azure PR) strips refs/heads/ and wins over BUILD_SOURCEBRANCH', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.SYSTEM_PULLREQUEST_SOURCEBRANCH = 'refs/heads/azure-pr-source';
    process.env.BUILD_SOURCEBRANCH = 'refs/heads/azure-target';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('azure-pr-source');
  });

  it('BUILD_SOURCEBRANCH with refs/heads/ stripped wins over GitHub vars', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.BUILD_SOURCEBRANCH = 'refs/heads/azure-feature';
    process.env.GITHUB_HEAD_REF = 'github-feature';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('azure-feature');
  });

  it('treats bare "merge" in BUILD_SOURCEBRANCH after stripping as absent', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.BUILD_SOURCEBRANCH = 'refs/heads/merge';
    process.env.GITHUB_HEAD_REF = 'github-feature';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('github-feature');
  });

  it('GITHUB_HEAD_REF wins over GITHUB_REF_NAME', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.GITHUB_HEAD_REF = 'feature/my-pr';
    process.env.GITHUB_REF_NAME = 'other-ref';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('feature/my-pr');
  });

  it('GITHUB_REF_NAME is used when it is not a merge ref', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.GITHUB_REF_NAME = 'push-branch';

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('push-branch');
  });

  it('skips GITHUB_REF_NAME that encodes a PR merge ref (N/merge)', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    process.env.GITHUB_REF_NAME = '42/merge';
    // No other CI env set and not on a real branch -> falls back to git

    const info = await getGitInfo(fixture.dir);

    // The git fallback for a non-detached HEAD returns the branch name.
    expect(info.branchName).toBe('main');
  });

  it('detached HEAD without any CI signal yields "HEAD" sentinel', async () => {
    fixture = GitFixture.create();
    const sha = fixture.commitFile('c1');
    fixture.detach(sha);

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('HEAD');
  });
});

// ---------------------------------------------------------------------------
// repoSlug
// ---------------------------------------------------------------------------

describe('getGitInfo - repoSlug', () => {
  it('captures owner/repo from an HTTPS remote', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    fixture.git(['remote', 'add', 'origin', 'https://github.com/acme/my-app.git']);

    const info = await getGitInfo(fixture.dir);

    expect(info.repoSlug).toBe('acme/my-app');
  });

  it('captures owner/repo from an SSH remote', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    fixture.git(['remote', 'add', 'origin', 'git@github.com:acme/my-app.git']);

    const info = await getGitInfo(fixture.dir);

    expect(info.repoSlug).toBe('acme/my-app');
  });

  it('is host-agnostic (works for GitLab, Bitbucket, etc.)', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    fixture.git(['remote', 'add', 'origin', 'git@gitlab.com:org/project.git']);

    const info = await getGitInfo(fixture.dir);

    expect(info.repoSlug).toBe('org/project');
  });

  it('is omitted when no origin remote is configured', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    // No remote added.

    const info = await getGitInfo(fixture.dir);

    expect(info.repoSlug).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mergeBaseSha
// ---------------------------------------------------------------------------

describe('getGitInfo - mergeBaseSha', () => {
  it('is omitted for a non-merge-ref checkout', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');

    const info = await getGitInfo(fixture.dir);

    expect(info.mergeBaseSha).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Per-parent ancestor windows (merge commits)
// ---------------------------------------------------------------------------

describe('getGitInfo - perParentAncestorCommitHashes', () => {
  it('captures per-parent windows for the non-first parents of a merge commit', async () => {
    fixture = GitFixture.create();
    // Single commit on main before branching so f1's direct parent is c1.
    const c1 = fixture.commitFile('c1');

    fixture.branch('feature', { checkout: true });
    const f1 = fixture.commitFile('f1', 'f.txt');
    const f2 = fixture.commitFile('f2', 'f.txt');

    fixture.checkout('main');
    fixture.merge('feature');

    const info = await getGitInfo(fixture.dir);

    // parentCommitHashes = [c1 (main tip), f2 (feature tip)]
    expect(info.parentCommitHashes).toEqual([c1, f2]);

    // perParentAncestorCommitHashes[0] = first-parent ancestors of f2 (skip f2 itself)
    // f2 → f1 → c1; skip f2 → [f1, c1]
    expect(info.perParentAncestorCommitHashes).toBeDefined();
    expect(info.perParentAncestorCommitHashes![0]).toEqual([f1, c1]);
  });

  it('is absent for a non-merge (single-parent) commit', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    fixture.commitFile('c2');

    const info = await getGitInfo(fixture.dir);

    expect(info.perParentAncestorCommitHashes).toBeUndefined();
  });

  it('is absent when the canonical commit is a PR head with a single parent', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('base');
    fixture.branch('feature', { checkout: true });
    fixture.commitFile('pr-head', 'f.txt');
    fixture.checkout('main');
    const mergeSha = fixture.merge('feature');
    fixture.detach(mergeSha);
    process.env.GITHUB_REF_NAME = '1/merge';

    const info = await getGitInfo(fixture.dir);

    // canonical = PR head (single-parent commit)
    expect(info.perParentAncestorCommitHashes).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Shallow clone
// ---------------------------------------------------------------------------

describe('getGitInfo - shallow clone', () => {
  it('flags a depth-1 shallow clone as shallow', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    fixture.commitFile('c2');
    fixture.commitFile('c3');

    const shallow = fixture.shallowClone(1, 'main');
    try {
      const info = await getGitInfo(shallow.dir);
      expect(info.isShallow).toBe(true);
    } finally {
      shallow.cleanup();
    }
  });

  it('degrades gracefully on a shallow merge-ref clone: no crash, base fields populated', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('base on main');
    fixture.branch('feature', { checkout: true });
    fixture.commitFile('pr head', 'feature.txt');
    fixture.checkout('main');
    fixture.merge('feature');

    // depth=1 → only the merge commit is available; parent commits are truncated.
    const shallow = fixture.shallowClone(1, 'main');
    try {
      process.env.GITHUB_REF_NAME = '5/merge';
      const info = await getGitInfo(shallow.dir);

      // Must not fall back to the 'unknown' sentinel - we're inside a valid repo.
      expect(info.commitName).not.toBe('unknown');
      expect(info.commitHash).not.toBe('unknown');
      expect(info.branchName).not.toBe('unknown');
      expect(info.isShallow).toBe(true);
    } finally {
      shallow.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Dirty working tree
// ---------------------------------------------------------------------------

describe('getGitInfo - dirty working tree', () => {
  it('flags an uncommitted change as dirty', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('clean commit');
    fixture.makeDirty();

    const info = await getGitInfo(fixture.dir);

    expect(info.isDirty).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Failure fallback
// ---------------------------------------------------------------------------

describe('getGitInfo - failure fallback', () => {
  it('returns the unknown sentinel outside a git repository', async () => {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-not-a-repo-'));

    try {
      const info = await getGitInfo(nonRepo);
      expect(info).toEqual({
        commitName: 'unknown',
        commitHash: 'unknown',
        branchName: 'unknown',
      });
    } finally {
      fs.rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});
