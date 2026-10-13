import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
  type ThreeCommits,
  threeCommitRepository,
  writeGitHubEvent,
} from './support/gitInfoRepositories';

/**
 * Real-git tests for getGitInfo's payload fields outside the branch name and the refs: the base
 * payload, what a non-PR trigger reports, mergeBaseSha, the dirty flag, the per-parent windows,
 * and how a failed read degrades. No git commands are mocked. The rest of getGitInfo's cases
 * are in getGitInfo.test.ts, getGitInfo.mergeRefs.test.ts and getGitInfo.history.test.ts.
 */

isolateEachCase();

/** One commit, `c1`, on main. */
let oneCommit: GitFixture;
/** Three commits on main, `c1` to `c3`. */
let threeCommits: ThreeCommits;
/** A pull request's merge commit checked out detached - what a CI merge ref checks out. */
let prMergeRef: MergedPullRequest;

beforeAll(() => {
  oneCommit = oneCommitRepository();
  threeCommits = threeCommitRepository();
  prMergeRef = mergePullRequest();
  prMergeRef.repository.detach(prMergeRef.mergeSha);
});

afterAll(() => {
  for (const shared of [oneCommit, threeCommits?.repository, prMergeRef?.repository]) {
    shared?.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Base payload
// ---------------------------------------------------------------------------

describe('getGitInfo - base payload', () => {
  it('captures branchName, commitHash and commitName for a simple repo', async () => {
    const fixture = ownRepository();
    const sha = fixture.commitFile('initial commit');

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('main');
    expect(info.commitHash).toBe(sha);
    expect(info.commitName).toBe('initial commit');
  });

  it('reports a clean, non-shallow repo and omits ancestry fields for a root commit', async () => {
    const info = await getGitInfo(oneCommit.dir);

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
// Non-PR trigger shapes (schedule / workflow_dispatch)
// ---------------------------------------------------------------------------

describe('getGitInfo - non-PR trigger shapes (schedule / workflow_dispatch)', () => {
  it('a schedule-shaped env (ref name = default branch, no pull_request) skips merge-ref canonicalisation', async () => {
    process.env.GITHUB_REF_NAME = 'main';
    process.env.GITHUB_HEAD_REF = '';
    process.env.GITHUB_EVENT_PATH = writeGitHubEvent({
      repository: { default_branch: 'main' },
    });

    const info = await getGitInfo(oneCommit.dir);

    expect(info.prHeadCommitHash).toBeUndefined();
    expect(info.mergeBaseSha).toBeUndefined();
    expect(info.branchName).toBe('main');
    expect(info.defaultBranch).toBe('main');
  });

  it('a workflow_dispatch-shaped env (payload also carries `inputs`) is byte-equal to the schedule case', async () => {
    process.env.GITHUB_REF_NAME = 'main';
    process.env.GITHUB_HEAD_REF = '';
    process.env.GITHUB_EVENT_PATH = writeGitHubEvent({
      repository: { default_branch: 'main' },
      inputs: { someFlag: 'true' },
    });

    const info = await getGitInfo(oneCommit.dir);

    expect(info.prHeadCommitHash).toBeUndefined();
    expect(info.mergeBaseSha).toBeUndefined();
    expect(info.branchName).toBe('main');
    expect(info.defaultBranch).toBe('main');
  });

  // Pins current behavior deliberately (research 2026-08-24): whether a tag name
  // is the right value for `branchName` when resolving a baseline is an open
  // product question. Changing this is a decision, not a refactor.
  it('a workflow_dispatch run on a tag lands the tag name in branchName (pinned, not endorsed)', async () => {
    process.env.GITHUB_REF_NAME = 'v1.2.3';
    process.env.GITHUB_HEAD_REF = '';
    process.env.GITHUB_EVENT_PATH = writeGitHubEvent({
      repository: { default_branch: 'main' },
      inputs: {},
    });

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('v1.2.3');
  });
});

// ---------------------------------------------------------------------------
// mergeBaseSha
// ---------------------------------------------------------------------------

describe('getGitInfo - mergeBaseSha', () => {
  it('is omitted for a non-merge-ref checkout', async () => {
    const info = await getGitInfo(oneCommit.dir);

    expect(info.mergeBaseSha).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Per-parent ancestor windows (merge commits)
// ---------------------------------------------------------------------------

describe('getGitInfo - perParentAncestorCommitHashes', () => {
  it('captures per-parent windows for the non-first parents of a merge commit', async () => {
    const fixture = ownRepository();
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
    const info = await getGitInfo(threeCommits.repository.dir);

    expect(info.perParentAncestorCommitHashes).toBeUndefined();
  });

  it('is absent when the canonical commit is a PR head with a single parent', async () => {
    process.env.GITHUB_REF_NAME = '1/merge';

    const info = await getGitInfo(prMergeRef.repository.dir);

    // canonical = PR head (single-parent commit)
    expect(info.perParentAncestorCommitHashes).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Dirty working tree
// ---------------------------------------------------------------------------

describe('getGitInfo - dirty working tree', () => {
  it('flags an uncommitted change as dirty', async () => {
    const fixture = ownRepository();
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

  it('a git read that failed warns in one line, naming the reason and nothing about this machine', async () => {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-not-a-repo-'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await getGitInfo(nonRepo);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const printed = warnSpy.mock.calls[0].join(' ');

      // One line: no stack frames, no `node:child_process` internals, no trailing
      // `{ code, killed, signal, cmd, stdout, stderr }` object dump.
      expect(printed.split('\n')).toHaveLength(1);
      expect(printed).not.toContain('    at ');
      expect(printed).not.toContain('node:child_process');
      // Nothing about THIS machine: neither the project checkout path nor the
      // source file that ran the failing command.
      expect(printed).not.toContain(nonRepo);
      expect(printed).not.toContain('executeCommand.ts');
      // The reason a reader needs - git's own explanation - is what's left.
      expect(printed).toContain('not a git repository');
    } finally {
      warnSpy.mockRestore();
      fs.rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});
