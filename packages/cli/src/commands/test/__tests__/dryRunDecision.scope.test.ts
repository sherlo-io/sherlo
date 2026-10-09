import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../helpers/reporting', () => ({
  default: { addBreadcrumb: vi.fn() },
}));

import { requestDryRunDecision, type DryRunPlatformRequest } from '../dryRunDecision';
import { installServerCalls, type ServerCalls } from '../../../seams/serverCalls';

/**
 * THE PREVIEW SENDS THE CONFIG'S SCOPE - written as a skeleton in plan (epic diff-scope-closure, task
 * preview-answers-inside-the-scope). The worker fills the bodies and never renames a case.
 *
 * A real build's decision is narrowed to the config's include and exclude lists; the preview's
 * request carried neither, so a preview could name a story the real build would skip.
 */
const TOKEN = 'test-token';

// Installed as the whole server seam's `computeDiffScopeDryRun` - the real client (and the token
// it is built from) now lives entirely inside ../../../seams/serverCalls.
let query: ReturnType<typeof vi.fn>;
let restoreServerCalls: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  query = vi.fn().mockResolvedValue({ platforms: [] });
  restoreServerCalls = installServerCalls({
    computeDiffScopeDryRun: query as unknown as ServerCalls['computeDiffScopeDryRun'],
  } as unknown as ServerCalls);
});

afterEach(() => {
  restoreServerCalls();
});

const gitInfo: any = { branchName: 'feature', commitHash: 'abc', commitName: 'msg' };

const platforms: DryRunPlatformRequest[] = [
  { platform: 'ios', bundled: true, manifest: undefined },
];

describe('the preview sends the config scope', () => {
  it('the preview request carries the include and exclude lists the config names', async () => {
    await requestDryRunDecision({
      token: TOKEN,
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
    await requestDryRunDecision({
      token: TOKEN,
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
