import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import getGitInfo, { ANCESTOR_LIMIT } from '../getGitInfo';
import GitFixture from './support/gitFixture';

/**
 * Real-git tests for getGitInfo, driven by the deterministic {@link GitFixture}
 * harness. No git commands are mocked - these exercise the actual sub-commands
 * getGitInfo relies on.
 */

let fixture: GitFixture;

// getGitInfo reads GitHub-Actions env vars; neutralise them so the suite is
// stable whether it runs locally or inside Actions (where they'd be set).
const GIT_ENV_KEYS = ['GITHUB_HEAD_REF', 'GITHUB_REF_NAME'] as const;
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

describe('getGitInfo - base payload', () => {
  it('captures branchName, commitHash and commitName for a simple repo', async () => {
    fixture = GitFixture.create();
    const sha = fixture.commitFile('initial commit');

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('main');
    expect(info.commitHash).toBe(sha);
    expect(info.commitName).toBe('initial commit');
  });

  it('reports a clean, non-shallow repo and omits PR-head for a root commit', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('only commit');

    const info = await getGitInfo(fixture.dir);

    expect(info.isShallow).toBe(false);
    expect(info.isDirty).toBe(false);
    // Root commit has no parents -> these additive fields are omitted.
    expect(info.parentCommitHashes).toBeUndefined();
    expect(info.prHeadCommitHash).toBeUndefined();
    expect(info.ancestorCommitHashes).toBeUndefined();
  });
});

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

  it('bounds the ancestor list to ANCESTOR_LIMIT entries', async () => {
    fixture = GitFixture.create();
    for (let i = 0; i <= ANCESTOR_LIMIT + 5; i++) {
      fixture.commitFile(`commit ${i}`);
    }

    const info = await getGitInfo(fixture.dir);

    expect(info.ancestorCommitHashes).toHaveLength(ANCESTOR_LIMIT);
  });
});

describe('getGitInfo - PR merge ref', () => {
  it('reports the real PR-head SHA (second parent), not the synthetic merge commit', async () => {
    fixture = GitFixture.create();
    const base = fixture.commitFile('base on main');

    // PR source branch with its own head commit.
    fixture.branch('feature', { checkout: true });
    const prHead = fixture.commitFile('pr head commit', 'feature.txt');

    // Synthetic merge commit, as GitHub Actions creates for refs/pull/N/merge.
    fixture.checkout('main');
    const mergeSha = fixture.merge('feature');
    fixture.detach(mergeSha);

    // Simulate the CI PR merge-ref environment.
    process.env.GITHUB_REF_NAME = '123/merge';

    const info = await getGitInfo(fixture.dir);

    expect(info.commitHash).toBe(mergeSha);
    expect(info.parentCommitHashes).toEqual([base, prHead]);
    expect(info.prHeadCommitHash).toBe(prHead);
  });

  it('does not set prHeadCommitHash for a normal merge outside a PR merge ref', async () => {
    fixture = GitFixture.create();
    const base = fixture.commitFile('base on main');
    fixture.branch('feature', { checkout: true });
    const prHead = fixture.commitFile('pr head commit', 'feature.txt');
    fixture.checkout('main');
    const mergeSha = fixture.merge('feature');

    // No GITHUB_REF_NAME=*/merge -> not a PR merge ref.
    const info = await getGitInfo(fixture.dir);

    expect(info.commitHash).toBe(mergeSha);
    expect(info.parentCommitHashes).toEqual([base, prHead]);
    expect(info.prHeadCommitHash).toBeUndefined();
  });
});

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
});

describe('getGitInfo - dirty working tree', () => {
  it('flags an uncommitted change as dirty', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('clean commit');
    fixture.makeDirty();

    const info = await getGitInfo(fixture.dir);

    expect(info.isDirty).toBe(true);
  });
});

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
