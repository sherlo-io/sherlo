import { describe, expect, it, vi } from 'vitest';
import type { OpenBuildRequest } from '@sherlo/api-types';
// Import the real openBuild client factory (transport-agnostic): it forwards the
// whole `gitInfo` object as the `$gitInfo: GitInfoInput!` GraphQL variable
// without enumerating its sub-fields. That is exactly why additive optional
// fields are backward compatible.
import openBuild from '@sherlo/sdk-client/dist/requests/mutations/openBuild';

function createFakeApolloClient() {
  const mutate = vi.fn().mockResolvedValue({
    data: { openBuild: { build: { index: 1 }, projectIndex: 0, teamId: 'team' } },
  });
  // openBuild only ever calls client.mutate(...)
  return { client: { mutate } as any, mutate };
}

const baseRequest: Omit<OpenBuildRequest, 'gitInfo'> = {
  buildRunConfig: {} as OpenBuildRequest['buildRunConfig'],
  projectIndex: 0,
  teamId: 'team',
};

describe('openBuild gitInfo backward compatibility', () => {
  it('opens a build with the legacy 3-field payload (unknown sentinel)', async () => {
    const { client, mutate } = createFakeApolloClient();

    const legacyGitInfo = {
      branchName: 'unknown',
      commitHash: 'unknown',
      commitName: 'unknown',
    };

    const result = await openBuild(client)({ ...baseRequest, gitInfo: legacyGitInfo });

    expect(result).toEqual({ build: { index: 1 }, projectIndex: 0, teamId: 'team' });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0].variables.gitInfo).toEqual(legacyGitInfo);
  });

  it('opens a build with a real 3-field payload', async () => {
    const { client, mutate } = createFakeApolloClient();

    const gitInfo = {
      branchName: 'main',
      commitHash: 'abc123',
      commitName: 'feat: something',
    };

    await openBuild(client)({ ...baseRequest, gitInfo });

    expect(mutate.mock.calls[0][0].variables.gitInfo).toEqual(gitInfo);
  });

  it('forwards the new additive optional fields untouched when present', async () => {
    const { client, mutate } = createFakeApolloClient();

    const gitInfo = {
      branchName: 'main',
      commitHash: 'merge-sha',
      commitName: 'Merge feature',
      prHeadCommitHash: 'pr-head-sha',
      parentCommitHashes: ['base-sha', 'pr-head-sha'],
      ancestorCommitHashes: ['base-sha'],
      isShallow: false,
      isDirty: true,
    };

    await openBuild(client)({ ...baseRequest, gitInfo });

    expect(mutate.mock.calls[0][0].variables.gitInfo).toEqual(gitInfo);
  });
});
