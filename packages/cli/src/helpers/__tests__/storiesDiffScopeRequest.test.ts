import fetch from 'node-fetch';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, postGraphql } from '../graphqlRequest';
import { fetchStoriesDiffScopePage } from '../storiesDiffScopeRequest';
import { WHOLE_PAGE } from './support/storiesDiffScopeFixture';

vi.mock('node-fetch', () => ({ default: vi.fn() }));

const fetchMock = vi.mocked(fetch);

function answerWith(status: number, body: unknown): void {
  fetchMock.mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    statusText: 'status text',
    json: async () => body,
  } as never);
}

const VARIABLES = {
  teamId: 'tm000001',
  projectIndex: 1,
  buildIndex: 7,
  platform: 'ios' as const,
};

beforeEach(() => fetchMock.mockReset());

describe('the read of one page of stories (fetchStoriesDiffScopePage)', () => {
  it('asks the service for the page and answers its stories as sent', async () => {
    answerWith(200, { data: { getStoriesDiffScope: WHOLE_PAGE } });

    const page = await fetchStoriesDiffScopePage('https://api.test', 'token', VARIABLES, 5000);

    expect(page).toEqual(WHOLE_PAGE);
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string; timeout: number }];
    expect(init.timeout).toBe(5000);
    expect(JSON.parse(init.body).variables).toEqual(VARIABLES);
    expect(JSON.parse(init.body).query).toContain('getStoriesDiffScope(');
  });

  it('answers null when the team has no Diff Scope viewer', async () => {
    answerWith(200, { data: { getStoriesDiffScope: null } });

    expect(await fetchStoriesDiffScopePage('https://api.test', 'token', VARIABLES)).toBeNull();
  });
});

describe('the raw GraphQL post (postGraphql)', () => {
  it('refuses a token the service refused, as an authentication error', async () => {
    answerWith(401, {});

    await expect(
      postGraphql({ endpointUrl: 'u', apiToken: 't', query: 'q', variables: {} })
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('names the GraphQL errors of an answer that carries them', async () => {
    answerWith(200, { errors: [{ message: 'boom' }] });

    await expect(
      postGraphql({ endpointUrl: 'u', apiToken: 't', query: 'q', variables: {} })
    ).rejects.toThrow(/GraphQL errors/);
  });

  it('codes a failed HTTP answer as http and its status', async () => {
    answerWith(500, {});

    await expect(
      postGraphql({ endpointUrl: 'u', apiToken: 't', query: 'q', variables: {} })
    ).rejects.toMatchObject({ code: 'http500' });
  });

  it('codes GraphQL errors by the error type the service gave', async () => {
    answerWith(200, { errors: [{ message: 'boom', errorType: 'ThrottlingException' }] });

    await expect(
      postGraphql({ endpointUrl: 'u', apiToken: 't', query: 'q', variables: {} })
    ).rejects.toMatchObject({ code: 'ThrottlingException' });
  });

  it('codes GraphQL errors that give no error type as graphqlError', async () => {
    answerWith(200, { errors: [{ message: 'boom' }] });

    await expect(
      postGraphql({ endpointUrl: 'u', apiToken: 't', query: 'q', variables: {} })
    ).rejects.toMatchObject({ code: 'graphqlError' });
  });
});
