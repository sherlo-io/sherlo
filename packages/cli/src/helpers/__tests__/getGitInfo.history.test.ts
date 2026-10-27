import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// The REAL git read, not the seam's dispatcher (../../seams/surroundings): this suite is
// about what the tool asks a real repository.
import { ANCESTOR_LIMIT, readGitInfoFromDisk as getGitInfo } from '../getGitInfo';
import { captureTranscript } from '../transcriptSink';
import GitFixture from './support/gitFixture';
import {
  isolateEachCase,
  type MergedPullRequest,
  mergePullRequest,
  ownRepository,
  type ThreeCommits,
  threeCommitRepository,
  writeGitHubEvent,
} from './support/gitInfoRepositories';

/**
 * Real-git tests for getGitInfo on a commit's history: parents and ancestors, shallow clones
 * and the commit a job of a pull request run names. No git commands are mocked. The cases are
 * split across six files: the branch a run reports is in getGitInfo.test.ts, pull request merge
 * refs in getGitInfo.mergeRefs.test.ts, merge queue refs in getGitInfo.mergeQueue.test.ts, the
 * remote and default branch in getGitInfo.historyRemote.test.ts, and the rest of the payload
 * in getGitInfo.fields.test.ts.
 */

isolateEachCase();

/** Three commits on main, `c1` to `c3`. */
let threeCommits: ThreeCommits;
/** A depth-1 clone of the three commits' main. */
let threeCommitsShallow: GitFixture;
/** A pull request merged into main, and `shallow`, a depth-1 clone of main. */
let mergedOnMain: MergedPullRequest & { shallow: GitFixture };

beforeAll(() => {
  threeCommits = threeCommitRepository();
  threeCommitsShallow = threeCommits.repository.shallowClone(1, 'main');

  const merged = mergePullRequest();
  mergedOnMain = { ...merged, shallow: merged.repository.shallowClone(1, 'main') };
});

afterAll(() => {
  for (const shared of [
    threeCommits?.repository,
    threeCommitsShallow,
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
// Shallow clone
// ---------------------------------------------------------------------------

describe('getGitInfo - shallow clone', () => {
  it('flags a depth-1 shallow clone as shallow', async () => {
    // A depth-1 clone of main, whose history holds three commits.
    const info = await getGitInfo(threeCommitsShallow.dir);

    expect(info.isShallow).toBe(true);
  });

  it("warns once, on one line, with git's reason when the host refuses the history fetch", async () => {
    let info: Awaited<ReturnType<typeof getGitInfo>> | undefined;
    const { stderr } = await captureTranscript(async () => {
      info = await getGitInfo(threeCommitsShallow.dir);
    });

    const warningLines = stderr
      .split('\n')
      .filter((line) => line.includes("Couldn't fetch the git history"));
    expect(warningLines).toHaveLength(1);
    expect(warningLines[0].length).toBeGreaterThan("! Couldn't fetch the git history: ".length);
    expect(info?.isShallow).toBe(true);
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

// ---------------------------------------------------------------------------
// The commit a job names
// ---------------------------------------------------------------------------

describe('getGitInfo - the commit a job of a pull request run names', () => {
  it('two jobs of one pull request run name the same commit, on a shallow or a deepened checkout', async () => {
    // One pull_request run: both jobs check out the same synthetic merge commit at depth 1
    // (actions/checkout's default) and read the same event payload. One job's checkout is
    // deepened by the action before the CLI runs; the other's stays shallow.
    const { repository, prHead } = mergePullRequest();
    const shallowJob = repository.shallowClone(1, 'main');
    const deepenedJob = repository.shallowClone(1, 'main');
    deepenedJob.git(['fetch', '--deepen=200', '--quiet']);
    process.env.GITHUB_REF_NAME = '7/merge';
    process.env.GITHUB_EVENT_PATH = writeGitHubEvent({ pull_request: { head: { sha: prHead } } });

    try {
      const shallowInfo = await getGitInfo(shallowJob.dir);
      const deepenedInfo = await getGitInfo(deepenedJob.dir);

      expect(shallowInfo.commitHash).toBe(prHead);
      expect(deepenedInfo.commitHash).toBe(prHead);
    } finally {
      for (const fixture of [repository, shallowJob, deepenedJob]) fixture.cleanup();
    }
  });
});
