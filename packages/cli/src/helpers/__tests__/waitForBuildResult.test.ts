/**
 * Tests for waitForBuildResult - the --wait polling helper.
 *
 * Each exit-code case is covered by mocking the fetch response from the
 * GraphQL endpoint. Timer mocks accelerate the polling loop so tests
 * complete instantly.
 */

import fetch from 'node-fetch';
import chalk from 'chalk';
import { afterEach, beforeEach, describe, expect, it, vi, Mock } from 'vitest';
import waitForBuildResult, {
  EXIT_BLOCK,
  EXIT_ERROR,
  EXIT_GREEN,
  EXIT_TIMEOUT,
} from '../waitForBuildResult';

chalk.level = 0;

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
  runError?: unknown,
  diffScopeInfo?: {
    capturedSnapshotCount?: number;
    inheritedSnapshotCount?: number;
    platforms?: {
      android?: { reason?: string };
      ios?: { reason?: string };
    };
  }
): { getBuildStatus: Record<string, unknown> } {
  return {
    getBuildStatus: {
      runStatus,
      viewStatusesCount: viewStatusesCount ?? null,
      runError: runError ?? null,
      diffScopeInfo: diffScopeInfo ?? null,
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
  /* EXIT 0 - GREEN, server-bypassed build (SHERLO-1959/1962/1963)        */
  /* the API closed the build without ever running it: zero captures,    */
  /* every snapshot inherited, per-platform prose reason preserved.       */
  /*                                                                      */
  /* Fixtures mirror the REAL persisted shape pinned by the API's own     */
  /* closeAsZeroCaptureNoOp.unit.test.ts: the reason lives in             */
  /* diffScopeInfo.platforms.<platform>.reason (plain prose), and there   */
  /* is NO fullCaptureTriggerReason (a machine enum code only ever set on */
  /* a FULL capture, never on a bypassed partial-capture build).          */
  /* ------------------------------------------------------------------ */

  describe('server-bypassed build closing message', () => {
    function printedOutput(spy: ReturnType<typeof vi.spyOn>): string {
      return spy.mock.calls.map((call: unknown[]) => call[0] ?? '').join('\n');
    }

    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it('prints the "nothing needed capturing" closing line and pins its wording', async () => {
      mockGraphqlResponse(
        200,
        buildResponse(
          'finished',
          { approved: 5, noChanges: 10, reported: 0, unreviewed: 0 },
          undefined,
          {
            capturedSnapshotCount: 0,
            inheritedSnapshotCount: 15,
            platforms: { android: { reason: 'no change reaches any story' } },
          }
        )
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

      const printed = printedOutput(logSpy);
      expect(printed).toMatchSnapshot();
    });

    it('prints the bypassed closer off the real API shape even with no fullCaptureTriggerReason (regression, SHERLO-1963)', async () => {
      // Exactly what the deployed API persists for a server-bypassed build:
      // zero captured, some inherited, a per-platform prose reason, and NO
      // fullCaptureTriggerReason. Under the pre-fix gate (which required
      // fullCaptureTriggerReason) this case wrongly printed the generic line.
      mockGraphqlResponse(
        200,
        buildResponse(
          'finished',
          { approved: 0, noChanges: 2, reported: 0, unreviewed: 0 },
          undefined,
          {
            capturedSnapshotCount: 0,
            inheritedSnapshotCount: 2,
            platforms: { android: { reason: 'no change reaches any story' } },
          }
        )
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

      const printed = printedOutput(logSpy);
      expect(printed).toContain('Nothing needed capturing');
      // The platform reason is printed verbatim as the closer's reason line.
      expect(printed).toContain('no change reaches any story');
      expect(printed).not.toContain('All stories passed');
    });

    it('picks the android reason when both platforms carry prose (deterministic tie-break)', async () => {
      // Both platforms present with distinct prose: the fixed
      // PLATFORM_REASON_ORDER (android, then ios) makes the chosen line
      // deterministic regardless of JSON key order.
      mockGraphqlResponse(
        200,
        buildResponse(
          'finished',
          { approved: 0, noChanges: 4, reported: 0, unreviewed: 0 },
          undefined,
          {
            capturedSnapshotCount: 0,
            inheritedSnapshotCount: 4,
            platforms: {
              android: { reason: 'no change reaches any story' },
              ios: { reason: 'ios: nothing to capture' },
            },
          }
        )
      );

      const promise = waitForBuildResult({
        token: TOKEN,
        buildIndex: BUILD_INDEX,
        projectIndex: PROJECT_INDEX,
        teamId: TEAM_ID,
      });

      await vi.runAllTimersAsync();
      await promise;

      const printed = printedOutput(logSpy);
      expect(printed).toContain('Nothing needed capturing');
      expect(printed).toContain('no change reaches any story');
      expect(printed).not.toContain('ios: nothing to capture');
    });

    it('falls back to the ios reason when only ios carries prose', async () => {
      mockGraphqlResponse(
        200,
        buildResponse(
          'finished',
          { approved: 0, noChanges: 3, reported: 0, unreviewed: 0 },
          undefined,
          {
            capturedSnapshotCount: 0,
            inheritedSnapshotCount: 3,
            platforms: { ios: { reason: 'no change reaches any story' } },
          }
        )
      );

      const promise = waitForBuildResult({
        token: TOKEN,
        buildIndex: BUILD_INDEX,
        projectIndex: PROJECT_INDEX,
        teamId: TEAM_ID,
      });

      await vi.runAllTimersAsync();
      await promise;

      const printed = printedOutput(logSpy);
      expect(printed).toContain('Nothing needed capturing');
      expect(printed).toContain('no change reaches any story');
    });

    it('falls back to the generic green message when diffScopeInfo is absent', async () => {
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
      await promise;

      const printed = printedOutput(logSpy);
      expect(printed).toContain('All stories passed');
      expect(printed).not.toContain('Nothing needed capturing');
    });

    it('falls back to the generic green message when capturedSnapshotCount is not 0', async () => {
      mockGraphqlResponse(
        200,
        buildResponse(
          'finished',
          { approved: 5, noChanges: 10, reported: 0, unreviewed: 0 },
          undefined,
          {
            capturedSnapshotCount: 2,
            inheritedSnapshotCount: 13,
            platforms: { android: { reason: 'no change reaches any story' } },
          }
        )
      );

      const promise = waitForBuildResult({
        token: TOKEN,
        buildIndex: BUILD_INDEX,
        projectIndex: PROJECT_INDEX,
        teamId: TEAM_ID,
      });

      await vi.runAllTimersAsync();
      await promise;

      const printed = printedOutput(logSpy);
      expect(printed).toContain('All stories passed');
      expect(printed).not.toContain('Nothing needed capturing');
    });

    it('falls back to the generic green message when no platform reason is present', async () => {
      mockGraphqlResponse(
        200,
        buildResponse(
          'finished',
          { approved: 5, noChanges: 10, reported: 0, unreviewed: 0 },
          undefined,
          { capturedSnapshotCount: 0, inheritedSnapshotCount: 15 }
        )
      );

      const promise = waitForBuildResult({
        token: TOKEN,
        buildIndex: BUILD_INDEX,
        projectIndex: PROJECT_INDEX,
        teamId: TEAM_ID,
      });

      await vi.runAllTimersAsync();
      await promise;

      const printed = printedOutput(logSpy);
      expect(printed).toContain('All stories passed');
      expect(printed).not.toContain('Nothing needed capturing');
    });
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

  it('sends the correct Authorization header and getBuildStatus query', async () => {
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

    // Verify the POST body uses getBuildStatus (machine-auth query), not getBuild
    const body = JSON.parse(fetchCallArgs[1]?.body);
    expect(body.query).toMatch('getBuildStatus');
    expect(body.query).not.toMatch(/\bgetBuild\b/);
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

  it('retries when getBuildStatus returns null (build not found)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: { getBuildStatus: null } }),
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
