import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../helpers/reporting', () => ({
  default: { addBreadcrumb: vi.fn() },
}));

import { requestDryRunDecision, type DryRunPlatformRequest } from '../dryRunDecision';

/**
 * THE PREVIEW SENDS THE CONFIG'S SCOPE - written as a skeleton in plan (epic diff-scope-closure, task
 * preview-answers-inside-the-scope). The worker fills the bodies and never renames a case.
 *
 * A real build's decision is narrowed to the config's include and exclude lists; the preview's
 * request carried neither, so a preview could name a story the real build would skip.
 */
beforeEach(() => {
  vi.clearAllMocks();
});

const gitInfo: any = { branchName: 'feature', commitHash: 'abc', commitName: 'msg' };

function clientWith(computeDiffScopeDryRun: any): any {
  return { computeDiffScopeDryRun };
}

const platforms: DryRunPlatformRequest[] = [
  { platform: 'ios', bundled: true, manifest: undefined },
];

describe('the preview sends the config scope', () => {
  it('the preview request carries the include and exclude lists the config names', async () => {
    const query = vi.fn().mockResolvedValue({ platforms: [] });

    await requestDryRunDecision({
      client: clientWith(query),
      gitInfo,
      projectIndex: 1,
      teamId: 't',
      platforms,
      include: ['src/Storefront/**'],
      exclude: ['src/Storefront/Internal/**'],
    });

    const vars = query.mock.calls[0][0];
    expect(vars.include).toEqual(['src/Storefront/**']);
    expect(vars.exclude).toEqual(['src/Storefront/Internal/**']);
  });

  it('a config with neither list sends neither, and the request is what it was before', async () => {
    const query = vi.fn().mockResolvedValue({ platforms: [] });

    await requestDryRunDecision({
      client: clientWith(query),
      gitInfo,
      projectIndex: 1,
      teamId: 't',
      platforms,
    });

    const vars = query.mock.calls[0][0];
    expect('include' in vars).toBe(false);
    expect('exclude' in vars).toBe(false);
  });
});
