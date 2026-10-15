import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// The REAL git read, not the seam's dispatcher (../../seams/surroundings): this suite is
// about what the tool asks a real repository.
import { ANCESTOR_LIMIT, readGitInfoFromDisk as getGitInfo } from '../getGitInfo';
import GitFixture from './support/gitFixture';
import {
  isolateEachCase,
  type MergedPullRequest,
  mergePullRequest,
  oneCommitRepository,
  ownRepository,
  type ThreeCommits,
  threeCommitRepository,
  writeGitHubEvent,
} from './support/gitInfoRepositories';

/**
 * Real-git tests for getGitInfo on a commit's history and the repository around it: parents and
 * ancestors, the remote it names, its default branch, and shallow clones. No git commands are
 * mocked. The rest of getGitInfo's cases are in getGitInfo.test.ts, getGitInfo.mergeRefs.test.ts
 * and getGitInfo.fields.test.ts.
 */

isolateEachCase();

/** One commit, `c1`, on main, with no remote. */
let oneCommit: GitFixture;
/** Three commits on main, `c1` to `c3`. */
let threeCommits: ThreeCommits;
/**
 * One commit on main with a remote named origin, and the origin/HEAD a normal `git clone`
 * records, pointing at the remote's `develop`. Each remote case sets origin's address itself.
 */
let withOrigin: GitFixture;
/** A depth-1 clone of the three commits' main. */
let threeCommitsShallow: GitFixture;
/** A pull request merged into main, and `shallow`, a depth-1 clone of main. */
let mergedOnMain: MergedPullRequest & { shallow: GitFixture };

beforeAll(() => {
  oneCommit = oneCommitRepository();
  threeCommits = threeCommitRepository();
  threeCommitsShallow = threeCommits.repository.shallowClone(1, 'main');

  withOrigin = oneCommitRepository();
  withOrigin.git(['remote', 'add', 'origin', 'https://example.invalid/placeholder.git']);
  // What a normal `git clone` records: origin/HEAD points at the remote default.
  withOrigin.git(['update-ref', 'refs/remotes/origin/develop', 'HEAD']);
  withOrigin.git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/develop']);

  const merged = mergePullRequest();
  mergedOnMain = { ...merged, shallow: merged.repository.shallowClone(1, 'main') };
});

afterAll(() => {
  for (const shared of [
    oneCommit,
    threeCommits?.repository,
    threeCommitsShallow,
    withOrigin,
    mergedOnMain?.repository,
    mergedOnMain?.shallow,
  ]) {
    shared?.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Parents and ancestors
// ---------------------------------------------------------------------------

describe('getGitInfo - parents and ancestors', () => {
  it('captures the single parent and the bounded ancestor chain', async () => {
    const { c1, c2, c3 } = threeCommits;

    const info = await getGitInfo(threeCommits.repository.dir);

    expect(info.commitHash).toBe(c3);
    expect(info.parentCommitHashes).toEqual([c2]);
    // First-parent ancestry of HEAD, excluding HEAD itself, newest first.
    expect(info.ancestorCommitHashes).toEqual([c2, c1]);
  });

  it('bounds the ancestor list to ANCESTOR_LIMIT (200) entries', async () => {
    const fixture = ownRepository();
    fixture.commitMany(Array.from({ length: ANCESTOR_LIMIT + 6 }, (_, i) => `commit ${i}`));

    const info = await getGitInfo(fixture.dir);

    expect(ANCESTOR_LIMIT).toBe(200);
    expect(info.ancestorCommitHashes).toHaveLength(ANCESTOR_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// repoSlug
// ---------------------------------------------------------------------------

describe('getGitInfo - repoSlug', () => {
  it('captures owner/repo from an HTTPS remote', async () => {
    withOrigin.git(['remote', 'set-url', 'origin', 'https://github.com/acme/my-app.git']);

    const info = await getGitInfo(withOrigin.dir);

    expect(info.repoSlug).toBe('acme/my-app');
  });

  it('captures owner/repo from an SSH remote', async () => {
    withOrigin.git(['remote', 'set-url', 'origin', 'git@github.com:acme/my-app.git']);

    const info = await getGitInfo(withOrigin.dir);

    expect(info.repoSlug).toBe('acme/my-app');
  });

  it('is host-agnostic (works for GitLab, Bitbucket, etc.)', async () => {
    withOrigin.git(['remote', 'set-url', 'origin', 'git@gitlab.com:org/project.git']);

    const info = await getGitInfo(withOrigin.dir);

    expect(info.repoSlug).toBe('org/project');
  });

  it('is omitted when no origin remote is configured', async () => {
    // No remote added.
    const info = await getGitInfo(oneCommit.dir);

    expect(info.repoSlug).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// defaultBranch (the repository's main line)
// ---------------------------------------------------------------------------

describe('getGitInfo - defaultBranch', () => {
  it('reads repository.default_branch from the GitHub Actions event payload', async () => {
    process.env.GITHUB_EVENT_PATH = writeGitHubEvent({
      repository: { default_branch: 'trunk' },
    });

    const info = await getGitInfo(oneCommit.dir);

    expect(info.defaultBranch).toBe('trunk');
    // It is the repository's main line, not the branch being built.
    expect(info.branchName).toBe('main');
  });

  it('falls back to origin/HEAD when no event payload is available', async () => {
    // origin/HEAD points at the remote's develop, as a normal `git clone` records.
    const info = await getGitInfo(withOrigin.dir);

    expect(info.defaultBranch).toBe('develop');
  });

  it('prefers the event payload over origin/HEAD', async () => {
    process.env.GITHUB_EVENT_PATH = writeGitHubEvent({
      repository: { default_branch: 'trunk' },
    });

    const info = await getGitInfo(withOrigin.dir);

    expect(info.defaultBranch).toBe('trunk');
  });

  it('is omitted (never guessed) when neither source answers', async () => {
    // No event payload and no origin/HEAD ref.
    const info = await getGitInfo(oneCommit.dir);

    expect(info.defaultBranch).toBeUndefined();
  });

  it('is omitted on a shallow single-branch checkout, which records no origin/HEAD', async () => {
    const shallow = oneCommit.shallowClone(1, 'main');
    try {
      const info = await getGitInfo(shallow.dir);
      expect(info.defaultBranch).toBeUndefined();
    } finally {
      shallow.cleanup();
    }
  });

  it('is omitted when the event payload carries no repository object (e.g. merge_group)', async () => {
    process.env.GITHUB_EVENT_PATH = writeGitHubEvent({
      pull_request: { head: { sha: 'abc123' } },
    });

    const info = await getGitInfo(oneCommit.dir);

    expect(info.defaultBranch).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Shallow clone
// ---------------------------------------------------------------------------

describe('getGitInfo - shallow clone', () => {
  it('flags a depth-1 shallow clone as shallow', async () => {
    // A depth-1 clone of main, whose history holds three commits.
    const info = await getGitInfo(threeCommitsShallow.dir);

    expect(info.isShallow).toBe(true);
  });

  it('degrades gracefully on a shallow merge-ref clone: no crash, base fields populated', async () => {
    // depth=1 → only the merge commit is available; parent commits are truncated.
    const { shallow } = mergedOnMain;

    process.env.GITHUB_REF_NAME = '5/merge';
    const info = await getGitInfo(shallow.dir);

    // Must not fall back to the 'unknown' sentinel - we're inside a valid repo.
    expect(info.commitName).not.toBe('unknown');
    expect(info.commitHash).not.toBe('unknown');
    expect(info.branchName).not.toBe('unknown');
    expect(info.isShallow).toBe(true);
  });
});
