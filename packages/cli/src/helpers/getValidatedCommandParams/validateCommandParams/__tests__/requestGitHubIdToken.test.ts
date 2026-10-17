import { afterEach, describe, expect, it, vi } from 'vitest';
import { GITHUB_ID_TOKEN_AUDIENCE } from '../../../../constants';
import requestGitHubIdToken from '../requestGitHubIdToken';

const REQUEST_URL = 'https://token-requests.example.com/job?api-version=2.0';

const fetchMock = vi.fn();

const JOB = { fetchUrl: fetchMock, requestUrl: REQUEST_URL, requestToken: 'job-request-token' };

afterEach(() => {
  fetchMock.mockReset();
});

describe("asking GitHub for the job's ID token", () => {
  it("asks GitHub for the job's ID token with Sherlo's audience and the job's request token", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ value: 'the-id-token' }) });

    const idToken = await requestGitHubIdToken(JOB);

    expect(idToken).toBe('the-id-token');
    expect(fetchMock).toHaveBeenCalledWith(`${REQUEST_URL}&audience=${GITHUB_ID_TOKEN_AUDIENCE}`, {
      headers: { Authorization: 'bearer job-request-token' },
    });
  });

  it('a failed request names the id-token permission', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });

    await expect(requestGitHubIdToken(JOB)).rejects.toThrow(/id-token: write/);
    await expect(requestGitHubIdToken(JOB)).rejects.toThrow(/SHERLO_TOKEN/);
  });
});
