import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// The REAL git read, not the seam's dispatcher (../../seams/surroundings): this suite is
// about what the tool asks a real repository.
import { readGitInfoFromDisk as getGitInfo } from '../getGitInfo';
import GitFixture from './support/gitFixture';
import { isolateEachCase, oneCommitRepository, ownRepository } from './support/gitInfoRepositories';

/**
 * Real-git tests for getGitInfo, driven by the deterministic {@link GitFixture}
 * harness. No git commands are mocked - these exercise the actual sub-commands
 * getGitInfo relies on.
 *
 * Every case reads a real repository through a dozen git processes, so the cases are split
 * across four files, by subject, to keep each one fast. This one holds which branch a run
 * reports. getGitInfo.mergeRefs.test.ts holds pull request and merge queue refs;
 * getGitInfo.history.test.ts holds parents, ancestors, the remote, the default branch and
 * shallow clones; getGitInfo.fields.test.ts holds the rest of the payload and how a failed read
 * degrades. What they share is in support/gitInfoRepositories.ts.
 */

isolateEachCase();

/** One commit, `c1`, on main - built once, read by every case that needs no shape of its own. */
let oneCommit: GitFixture;

beforeAll(() => {
  oneCommit = oneCommitRepository();
});

afterAll(() => {
  oneCommit?.cleanup();
});

// ---------------------------------------------------------------------------
// Branch resolution precedence
// ---------------------------------------------------------------------------

describe('getGitInfo - branch resolution precedence', () => {
  it('explicit branchOverride (--git-branch flag) wins over all env vars', async () => {
    process.env.SHERLO_BRANCH = 'from-env';
    process.env.BITRISE_GIT_BRANCH = 'from-bitrise';
    process.env.GITHUB_HEAD_REF = 'from-github';

    const info = await getGitInfo(oneCommit.dir, { branchOverride: 'explicit-override' });

    expect(info.branchName).toBe('explicit-override');
  });

  it('SHERLO_BRANCH wins over provider env vars', async () => {
    process.env.SHERLO_BRANCH = 'sherlo-branch';
    process.env.BITRISE_GIT_BRANCH = 'from-bitrise';
    process.env.CIRCLE_BRANCH = 'from-circle';

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('sherlo-branch');
  });

  it('treats bare "merge" value in SHERLO_BRANCH as absent', async () => {
    process.env.SHERLO_BRANCH = 'merge';
    process.env.BITRISE_GIT_BRANCH = 'from-bitrise';

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('from-bitrise');
  });

  it('BITRISE_GIT_BRANCH is used when higher-priority signals absent', async () => {
    process.env.BITRISE_GIT_BRANCH = 'my-feature';

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('my-feature');
  });

  it('CIRCLE_BRANCH wins over GitLab and below', async () => {
    process.env.CIRCLE_BRANCH = 'circle-feature';
    process.env.CI_COMMIT_REF_NAME = 'gitlab-branch';

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('circle-feature');
  });

  it('CI_COMMIT_REF_NAME (GitLab) wins over Codemagic and below', async () => {
    process.env.CI_COMMIT_REF_NAME = 'gitlab-feature';
    process.env.CM_BRANCH = 'codemagic-branch';

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('gitlab-feature');
  });

  it('CM_BRANCH (Codemagic) wins over Azure and below', async () => {
    process.env.CM_BRANCH = 'codemagic-feature';
    process.env.BUILD_SOURCEBRANCH = 'refs/heads/azure-branch';

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('codemagic-feature');
  });

  it('SYSTEM_PULLREQUEST_SOURCEBRANCH (Azure PR) strips refs/heads/ and wins over BUILD_SOURCEBRANCH', async () => {
    process.env.SYSTEM_PULLREQUEST_SOURCEBRANCH = 'refs/heads/azure-pr-source';
    process.env.BUILD_SOURCEBRANCH = 'refs/heads/azure-target';

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('azure-pr-source');
  });

  it('BUILD_SOURCEBRANCH with refs/heads/ stripped wins over GitHub vars', async () => {
    process.env.BUILD_SOURCEBRANCH = 'refs/heads/azure-feature';
    process.env.GITHUB_HEAD_REF = 'github-feature';

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('azure-feature');
  });

  it('treats bare "merge" in BUILD_SOURCEBRANCH after stripping as absent', async () => {
    process.env.BUILD_SOURCEBRANCH = 'refs/heads/merge';
    process.env.GITHUB_HEAD_REF = 'github-feature';

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('github-feature');
  });

  it('GITHUB_HEAD_REF wins over GITHUB_REF_NAME', async () => {
    process.env.GITHUB_HEAD_REF = 'feature/my-pr';
    process.env.GITHUB_REF_NAME = 'other-ref';

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('feature/my-pr');
  });

  it('GITHUB_REF_NAME is used when it is not a merge ref', async () => {
    process.env.GITHUB_REF_NAME = 'push-branch';

    const info = await getGitInfo(oneCommit.dir);

    expect(info.branchName).toBe('push-branch');
  });

  it('skips GITHUB_REF_NAME that encodes a PR merge ref (N/merge)', async () => {
    process.env.GITHUB_REF_NAME = '42/merge';
    // No other CI env set and not on a real branch -> falls back to git

    const info = await getGitInfo(oneCommit.dir);

    // The git fallback for a non-detached HEAD returns the branch name.
    expect(info.branchName).toBe('main');
  });

  it('detached HEAD without any CI signal yields "HEAD" sentinel', async () => {
    const fixture = ownRepository();
    const sha = fixture.commitFile('c1');
    fixture.detach(sha);

    const info = await getGitInfo(fixture.dir);

    expect(info.branchName).toBe('HEAD');
  });
});
