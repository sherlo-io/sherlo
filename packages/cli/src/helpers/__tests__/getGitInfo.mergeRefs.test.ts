import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// The REAL git read, not the seam's dispatcher (../../seams/surroundings): this suite is
// about what the tool asks a real repository.
import { readGitInfoFromDisk as getGitInfo } from '../getGitInfo';
import GitFixture from './support/gitFixture';
import {
  isolateEachCase,
  type MergedPullRequest,
  mergePullRequest,
  oneCommitRepository,
  ownRepository,
  writeGitHubEvent,
} from './support/gitInfoRepositories';

/**
 * Real-git tests for getGitInfo on the refs CI checks out for a pull request: a PR merge ref and a
 * merge queue ref, full and shallow. No git commands are mocked. The rest of getGitInfo's cases
 * are in getGitInfo.test.ts, getGitInfo.history.test.ts and getGitInfo.fields.test.ts.
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
// PR merge ref – canonicalisation
// ---------------------------------------------------------------------------

describe('getGitInfo - PR merge ref (refs/pull/N/merge)', () => {
  it('sets commitHash to the PR head (second parent), not the synthetic merge commit', async () => {
    const { prHead, mergeSha } = prMergeRef;

    process.env.GITHUB_REF_NAME = '123/merge';

    const info = await getGitInfo(prMergeRef.repository.dir);

    // commitHash must be the real PR head, not the synthetic merge commit.
    expect(info.commitHash).toBe(prHead);
    expect(info.commitHash).not.toBe(mergeSha);
  });

  it('sets parentCommitHashes and ancestorCommitHashes relative to the PR head', async () => {
    const { base } = prMergeRef;

    process.env.GITHUB_REF_NAME = '123/merge';

    const info = await getGitInfo(prMergeRef.repository.dir);

    // PR head's parent is `base`, NOT [base, prHead] (those are the merge's parents).
    expect(info.parentCommitHashes).toEqual([base]);
    // PR head's first-parent ancestry also leads to `base`.
    expect(info.ancestorCommitHashes).toEqual([base]);
  });

  it('sets prHeadCommitHash to the PR head SHA as a merge-ref signal', async () => {
    const { prHead } = prMergeRef;

    process.env.GITHUB_REF_NAME = '42/merge';

    const info = await getGitInfo(prMergeRef.repository.dir);

    // prHeadCommitHash signals to the server that this is a synthetic merge ref.
    expect(info.prHeadCommitHash).toBe(prHead);
    // commitHash is also the PR head (canonicalised).
    expect(info.commitHash).toBe(prHead);
  });

  it('computes mergeBaseSha as the true fork-point, not the base-branch tip', async () => {
    const fixture = ownRepository();
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
    const { mergeSha } = mergedOnMain;

    // No GITHUB_REF_NAME set -> not a PR merge ref.
    const info = await getGitInfo(mergedOnMain.repository.dir);

    expect(info.commitHash).toBe(mergeSha);
    expect(info.prHeadCommitHash).toBeUndefined();
    expect(info.mergeBaseSha).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PR merge ref – shallow clone (fetch-depth:1) PR-head recovery (SHERLO-1629)
//
// On GitHub's DEFAULT actions/checkout (fetch-depth:1) the synthetic merge
// commit is present but its parents are grafted away, so `git rev-parse HEAD^2`
// fails and the PR head can't be read from local history. Without a fallback,
// prHeadCommitHash is omitted and commitHash decays to the ephemeral merge SHA -
// which the server then uses as the commit-hash GSI key, hiding an approved PR
// build from later builds. The CLI recovers the real PR head from the CI event
// payload (GITHUB_EVENT_PATH -> pull_request.head.sha) instead.
// ---------------------------------------------------------------------------

describe('getGitInfo - PR merge ref shallow clone (event-payload PR-head recovery)', () => {
  it('recovers the real PR head from the GitHub event payload when HEAD^2 is unavailable', async () => {
    // depth=1 clone of the merge commit: HEAD^2 (the PR head) is grafted away.
    const { prHead, mergeSha, shallow } = mergedOnMain;

    process.env.GITHUB_REF_NAME = '123/merge';
    // The runner exposes the pull_request event, whose payload carries the PR head.
    process.env.GITHUB_EVENT_PATH = writeGitHubEvent({ pull_request: { head: { sha: prHead } } });

    const info = await getGitInfo(shallow.dir);

    // The fix: prHeadCommitHash is the REAL PR head, recovered from the CI signal.
    expect(info.prHeadCommitHash).toBe(prHead);
    expect(info.prHeadCommitHash).not.toBe(mergeSha);
    // commitHash can't be anchored to grafted-away history, so it gracefully stays
    // the merge SHA. The server keys on `prHeadCommitHash ?? commitHash`, so the
    // real PR head still wins.
    expect(info.commitHash).toBe(mergeSha);
    expect(info.isShallow).toBe(true);
  });

  it('omits prHeadCommitHash (never the merge SHA) on a shallow merge ref with no event payload', async () => {
    const { mergeSha, shallow } = mergedOnMain;

    process.env.GITHUB_REF_NAME = '123/merge';
    // No GITHUB_EVENT_PATH: neither HEAD^2 nor a CI signal is available.

    const info = await getGitInfo(shallow.dir);

    // Omit rather than record the wrong (merge) SHA - do not fabricate a PR head.
    expect(info.prHeadCommitHash).toBeUndefined();
    expect(info.prHeadCommitHash).not.toBe(mergeSha);
    expect(info.isShallow).toBe(true);
  });

  it('prefers the local HEAD^2 over the event payload on a full clone', async () => {
    const { prHead } = prMergeRef;

    process.env.GITHUB_REF_NAME = '123/merge';
    // A deliberately wrong event payload must NOT override the authoritative local HEAD^2.
    process.env.GITHUB_EVENT_PATH = writeGitHubEvent({
      pull_request: { head: { sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' } },
    });

    const info = await getGitInfo(prMergeRef.repository.dir);

    expect(info.prHeadCommitHash).toBe(prHead);
    expect(info.commitHash).toBe(prHead);
  });
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
