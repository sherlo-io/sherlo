import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// The REAL git read, not the seam's dispatcher (../../seams/surroundings): this suite is
// about what the tool asks a real repository.
import { readGitInfoFromDisk as getGitInfo } from '../getGitInfo';
import GitFixture from './support/gitFixture';
import {
  isolateEachCase,
  oneCommitRepository,
  writeGitHubEvent,
} from './support/gitInfoRepositories';

/**
 * Real-git tests for getGitInfo on the remote a repository names and its default branch. No git
 * commands are mocked. The cases are split across six files: the branch a run reports is in
 * getGitInfo.test.ts, pull request merge refs in getGitInfo.mergeRefs.test.ts, merge queue
 * refs in getGitInfo.mergeQueue.test.ts, a commit's parents, ancestors and shallow clones in
 * getGitInfo.history.test.ts, and the rest of the payload in getGitInfo.fields.test.ts.
 */

isolateEachCase();

/** One commit, `c1`, on main, with no remote. */
let oneCommit: GitFixture;
/**
 * One commit on main with a remote named origin, and the origin/HEAD a normal `git clone`
 * records, pointing at the remote's `develop`. Each remote case sets origin's address itself.
 */
let withOrigin: GitFixture;

beforeAll(() => {
  oneCommit = oneCommitRepository();

  withOrigin = oneCommitRepository();
  withOrigin.git(['remote', 'add', 'origin', 'https://example.invalid/placeholder.git']);
  // What a normal `git clone` records: origin/HEAD points at the remote default.
  withOrigin.git(['update-ref', 'refs/remotes/origin/develop', 'HEAD']);
  withOrigin.git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/develop']);
});

afterAll(() => {
  for (const shared of [oneCommit, withOrigin]) {
    shared?.cleanup();
  }
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
    // The git host is asked after origin/HEAD (getGitInfo.defaultBranchFromHost.test.ts), so
    // this case has an origin that cannot answer: only the local record is under test here.
    shallow.git(['remote', 'set-url', 'origin', '/no-such-git-host']);
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
