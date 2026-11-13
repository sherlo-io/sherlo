/**
 * The end of the checks for an app with no Storybook (../requirements), on the real scenes flag
 * reader: the service is asked through the server seam with the saved login, and with no saved
 * login nothing can answer it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reporting } from '../../../../helpers';
import { installSavedLogins, liveSavedLogins } from '../../../../seams/savedLogins';
import { installServerCalls, liveServerCalls } from '../../../../seams/serverCalls';
import { forgetScenesFlag } from '../../../../helpers/scenesFlag';
import { settleNoStorybook } from '../requirements';

vi.mock('../../helpers/trackProgress', () => ({
  default: vi.fn(async ({ sessionId }) => ({ sessionId })),
}));

const TEAM = 'k3j9x2ab';

describe('setup for an app with no Storybook, on the real scenes flag', () => {
  afterEach(() => {
    forgetScenesFlag();
    vi.restoreAllMocks();
  });

  it('a token run with no saved login reads scenes as off', async () => {
    // The team has scenes on, but a project token cannot ask the service for it: only a saved
    // login can, so with none the run is refused.
    const listTeams = vi.fn().mockResolvedValue({
      teams: [
        { id: TEAM, name: 'Acme', projectCount: 1, role: 'owner', featureFlags: { scenes: true } },
      ],
    });
    vi.spyOn(reporting, 'captureException').mockImplementation(() => {});
    const restores = [
      installServerCalls({ ...liveServerCalls, listTeams }),
      installSavedLogins({ ...liveSavedLogins, read: () => undefined }),
    ];

    try {
      await expect(settleNoStorybook({ teamId: TEAM, sessionId: null })).rejects.toThrow(
        'Set up Storybook before initializing Sherlo'
      );
      expect(listTeams).not.toHaveBeenCalled();
    } finally {
      restores.forEach((restore) => restore());
    }
  });
});
