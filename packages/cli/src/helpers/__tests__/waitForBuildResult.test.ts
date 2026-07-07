/**
 * Tests for waitForBuildResult - the --wait polling helper.
 *
 * Each exit-code case is covered by mocking the fetch response from the
 * GraphQL endpoint. Timer mocks accelerate the polling loop so tests
 * complete instantly.
 */

import fetch from 'node-fetch';
import { afterEach, beforeEach, describe, expect, it, vi, Mock } from 'vitest';
import waitForBuildResult, {
  EXIT_BLOCK,
  EXIT_ERROR,
  EXIT_GREEN,
  EXIT_TIMEOUT,
} from '../waitForBuildResult';

// The token format used throughout: 32-char apiToken + 8-char teamId + projectIndex
const API_TOKEN = 'A'.repeat(32);
const TEAM_ID = 'B'.repeat(8);
const PROJECT_INDEX = 42;
const TOKEN = `${API_TOKEN}${TEAM_ID}${PROJECT_INDEX}`;
const BUILD_INDEX = 1;

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

const mockFetch = fetch as unknown as Mock;

// Helper: build a minimal GraphQL response body
function buildResponse(
  runStatus: string,
  viewStatusesCount?: { approved: number; noChanges: number; reported: number; unreviewed: number },
  runError?: unknown
): { getBuild: Record<string, unknown> } {
  return {
    getBuild: {
      runStatus,
      viewStatusesCount: viewStatusesCount ?? null,
      runError: runError ?? null,
      startedAt: null,
      queuedAt: null,
      finishedAt: null,
    },
  };
}

function mockGraphqlResponse(status: number, data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => ({ data }),
  });
}

describe('waitForBuildResult', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /* ------------------------------------------------------------------ */
  /* EXIT 0 - GREEN                                                      */
  /* ------------------------------------------------------------------ */

  it('exits 0 (GREEN) when build finishes with no unreviewed and no reported', async () => {
    mockGraphqlResponse(
      200,
      buildResponse('finished', { approved: 5, noChanges: 10, reported: 0, unreviewed: 0 })
    );

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_GREEN);
  });

  it('exits 0 (GREEN) when viewStatusesCount has no reported/unreviewed (even if nullish)', async () => {
    // simulate a build that finished before view statuses populated
    mockGraphqlResponse(
      200,
      buildResponse('finished', { approved: 0, noChanges: 3, reported: 0, unreviewed: 0 })
    );

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_GREEN);
  });

  it('exits 0 (GREEN) when viewStatusesCount is missing (treat as zero)', async () => {
    mockGraphqlResponse(200, buildResponse('finished'));

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_GREEN);
  });

  /* ------------------------------------------------------------------ */
  /* EXIT 1 - BLOCK (unreviewed or reported changes)                     */
  /* ------------------------------------------------------------------ */

  it('exits 1 (BLOCK) when build finishes with unreviewed changes', async () => {
    mockGraphqlResponse(
      200,
      buildResponse('finished', { approved: 3, noChanges: 5, reported: 0, unreviewed: 3 })
    );

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_BLOCK);
  });

  it('exits 1 (BLOCK) when build finishes with reported (denied) changes', async () => {
    mockGraphqlResponse(
      200,
      buildResponse('finished', { approved: 3, noChanges: 5, reported: 2, unreviewed: 0 })
    );

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_BLOCK);
  });

  it('exits 1 (BLOCK) when both unreviewed and reported are present', async () => {
    mockGraphqlResponse(
      200,
      buildResponse('finished', { approved: 1, noChanges: 2, reported: 1, unreviewed: 2 })
    );

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_BLOCK);
  });

  /* ------------------------------------------------------------------ */
  /* EXIT 2 - ERROR / CANCELED                                           */
  /* ------------------------------------------------------------------ */

  it('exits 2 (ERROR) when build runStatus is "error"', async () => {
    mockGraphqlResponse(200, buildResponse('error'));

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_ERROR);
  });

  it('exits 2 (ERROR) when build runStatus is "canceled"', async () => {
    mockGraphqlResponse(200, buildResponse('canceled'));

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_ERROR);
  });

  /* ------------------------------------------------------------------ */
  /* EXIT 3 - TIMEOUT                                                    */
  /* ------------------------------------------------------------------ */

  it('exits 3 (TIMEOUT) when build never reaches terminal state within waitTimeout', async () => {
    // Build stays "inProgress" forever
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: buildResponse('inProgress') }),
      })
    );

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
      waitTimeoutMinutes: 1, // 1 minute timeout
    });

    // Advance well past the timeout (1min timeout + enough 15s polling cycles)
    // With 15s polls: 0s, 15s, 30s, 45s, 60s (not > yet), 75s → timeout fires
    await vi.advanceTimersByTimeAsync(120_000);
    const result = await promise;

    expect(result).toBe(EXIT_TIMEOUT);
  }, 10_000);

  /* ------------------------------------------------------------------ */
  /* RESILIENCE - network errors are retried                              */
  /* ------------------------------------------------------------------ */

  it('retries on network error and eventually succeeds', async () => {
    // First call fails with network error
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    // Second call succeeds with finished/green
    mockGraphqlResponse(
      200,
      buildResponse('finished', { approved: 2, noChanges: 4, reported: 0, unreviewed: 0 })
    );

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_GREEN);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on HTTP error and eventually succeeds', async () => {
    // First call returns HTTP 500
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    });
    // Second call succeeds
    mockGraphqlResponse(
      200,
      buildResponse('finished', { approved: 1, noChanges: 1, reported: 0, unreviewed: 0 })
    );

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_GREEN);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  /* ------------------------------------------------------------------ */
  /* AUTH - header format and auth-failure handling                      */
  /* ------------------------------------------------------------------ */

  it('sends the correct Authorization header (JSON-stringified token object)', async () => {
    mockGraphqlResponse(
      200,
      buildResponse('finished', { approved: 0, noChanges: 1, reported: 0, unreviewed: 0 })
    );

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    await promise;

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify the exact Authorization header the Lambda authorizer expects
    const fetchCallArgs = mockFetch.mock.calls[0];
    const headers = fetchCallArgs[1]?.headers;
    expect(headers).toBeDefined();
    expect(headers.Authorization).toBe(JSON.stringify({ authToken: API_TOKEN }));
  });

  it('exits 2 (ERROR) immediately on HTTP 401 without retrying', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
    });

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_ERROR);
    expect(mockFetch).toHaveBeenCalledTimes(1); // no retries
  });

  it('exits 2 (ERROR) immediately on HTTP 403 without retrying', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({}),
    });

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_ERROR);
    expect(mockFetch).toHaveBeenCalledTimes(1); // no retries
  });

  it('exits 2 (ERROR) immediately on GraphQL auth error without retrying', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        errors: [{ errorType: 'UnauthorizedException', message: 'Not authorized' }],
      }),
    });

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_ERROR);
    expect(mockFetch).toHaveBeenCalledTimes(1); // no retries
  });

  /* ------------------------------------------------------------------ */
  /* STATE TRANSITIONS - polls through in-progress states                 */
  /* ------------------------------------------------------------------ */

  it('polls through queued → inProgress → finished states', async () => {
    mockGraphqlResponse(200, buildResponse('queued'));
    mockGraphqlResponse(200, buildResponse('inProgress'));
    mockGraphqlResponse(
      200,
      buildResponse('finished', { approved: 1, noChanges: 1, reported: 0, unreviewed: 0 })
    );

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_GREEN);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  /* ------------------------------------------------------------------ */
  /* NULL BUILD - build not found yet                                     */
  /* ------------------------------------------------------------------ */

  it('retries when getBuild returns null (build not found)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: { getBuild: null } }),
    });
    mockGraphqlResponse(
      200,
      buildResponse('finished', { approved: 0, noChanges: 1, reported: 0, unreviewed: 0 })
    );

    const promise = waitForBuildResult({
      token: TOKEN,
      buildIndex: BUILD_INDEX,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(EXIT_GREEN);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
