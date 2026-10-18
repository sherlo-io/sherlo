import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import liveGitHubTrade from '../liveGitHubTrade';

const REQUEST = { repository: 'acme-mobile/shop-app', teamId: 'k3j9x2ab' };

const tradeGithubIdToken = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ value: 'the-id-token' }) });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'https://token-requests.example.com/job?v=2');
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'job-request-token');
});

afterEach(() => {
  tradeGithubIdToken.mockReset();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('trading the job ID token with the service', () => {
  it('sends the ID token, the repository and the team, and answers a signed-in session', async () => {
    tradeGithubIdToken.mockResolvedValue({ status: 'SIGNED_IN', token: 'the-session' });

    const trade = await liveGitHubTrade({ tradeGithubIdToken }, REQUEST);

    expect(tradeGithubIdToken).toHaveBeenCalledWith({ idToken: 'the-id-token', ...REQUEST });
    expect(trade).toEqual({ status: 'signed-in', token: 'the-session' });
  });

  it("answers the team's name when the repository is not connected", async () => {
    tradeGithubIdToken.mockResolvedValue({ status: 'NOT_CONNECTED', teamName: 'Acme' });

    const trade = await liveGitHubTrade({ tradeGithubIdToken }, REQUEST);

    expect(trade).toEqual({ status: 'not-connected', teamName: 'Acme' });
  });

  it('refuses an answer that carries neither a session nor a team', async () => {
    tradeGithubIdToken.mockResolvedValue({ status: 'SIGNED_IN' });

    await expect(liveGitHubTrade({ tradeGithubIdToken }, REQUEST)).rejects.toThrow(
      /neither a session nor a team/
    );
  });
});
