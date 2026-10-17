import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// The REAL git read, not the seam's dispatcher (../../seams/surroundings): this suite is
// about what the tool asks a real repository.
import { readGitInfoFromDisk as getGitInfo } from '../getGitInfo';
import GitFixture, { mergeStep } from './support/gitFixture';
import {
  isolateEachCase,
  type MergedPullRequest,
  mergePullRequest,
  oneCommitRepository,
  ownRepository,
} from './support/gitInfoRepositories';

/**
 * Real-git tests for getGitInfo on a merge queue ref (`gh-readonly-queue/...`), full and shallow.
 * No git commands are mocked. The cases are split across six files: the branch a run reports
 * is in getGitInfo.test.ts, pull request merge refs in getGitInfo.mergeRefs.test.ts, parents,
 * ancestors and shallow clones in getGitInfo.history.test.ts, the remote and default branch
 * in getGitInfo.historyRemote.test.ts, and the rest of the payload in getGitInfo.fields.test.ts.
 */

isolateEachCase();

/** One commit, `c1`, on main. */
let oneCommit: GitFixture;
/** The pull request's merge commit checked out detached - what a CI merge ref checks out. */
let prMergeRef: MergedPullRequest;
/** The same history with HEAD on main at the merge, and `shallow`, a depth-1 clone of main. */
let mergedOnMain: MergedPullRequest & { shallow: GitFixture };

beforeAll(() => {
  oneCommit = oneCommitRepository();

  const merged = mergePullRequest();
  mergedOnMain = { ...merged, shallow: merged.repository.shallowClone(1, 'main') };

  // The same history, cloned (one git process, where building it again takes many) and checked
  // out detached at the merge.
  prMergeRef = { ...merged, repository: merged.repository.clone() };
  prMergeRef.repository.detach(prMergeRef.mergeSha);
});

afterAll(() => {
  for (const shared of [
    oneCommit,
    prMergeRef?.repository,
    mergedOnMain?.repository,
    mergedOnMain?.shallow,
  ]) {
    shared?.cleanup();
  }
});

// ---------------------------------------------------------------------------
// merge_group canonicalisation
// ---------------------------------------------------------------------------

describe('getGitInfo - merge_group (gh-readonly-queue)', () => {
  it('canonicalises commitHash to the PR head (second parent)', async () => {
    const { prHead, mergeSha } = prMergeRef;

    process.env.GITHUB_REF_NAME = 'gh-readonly-queue/main/pr-7-abc123';

    const info = await getGitInfo(prMergeRef.repository.dir);

    expect(info.commitHash).toBe(prHead);
    expect(info.commitHash).not.toBe(mergeSha);
  });

  it('sets prHeadCommitHash to the PR head SHA for merge_group refs', async () => {
    const { prHead } = prMergeRef;

    process.env.GITHUB_REF_NAME = 'gh-readonly-queue/main/pr-7-abc123';

    const info = await getGitInfo(prMergeRef.repository.dir);

    expect(info.prHeadCommitHash).toBe(prHead);
  });

  it('resolves branchName to the base branch extracted from the ref', async () => {
    process.env.GITHUB_REF_NAME = 'gh-readonly-queue/main/pr-7-abc123';

    const info = await getGitInfo(prMergeRef.repository.dir);

    expect(info.branchName).toBe('main');
  });

  it('omits prHeadCommitHash on a plain (non-merge-ref) checkout', async () => {
    const info = await getGitInfo(oneCommit.dir);

    expect(info.prHeadCommitHash).toBeUndefined();
  });

  it('sets parentCommitHashes and ancestorCommitHashes relative to the PR head', async () => {
    const fixture = ownRepository();
    const { base, prParent, prHead, mergeSha } = fixture.buildHistory([
      { mark: 'base', branch: 'main', message: 'base on main', parents: [] },
      {
        mark: 'prParent',
        branch: 'feature',
        message: 'pr commit 1',
        file: 'f.txt',
        parents: ['base'],
      },
      {
        mark: 'prHead',
        branch: 'feature',
        message: 'pr head',
        file: 'f.txt',
        parents: ['prParent'],
      },
      mergeStep('mergeSha', ['base', 'prHead']),
    ]);
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
    // Shallow clone at depth=1: merge commit is present but parent history is grafted away.
    const { shallow } = mergedOnMain;

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
  });
});
