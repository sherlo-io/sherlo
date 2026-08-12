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
  EXIT_SIGINT,
  EXIT_TIMEOUT,
  fetchServerBypassReason,
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

  it('keeps polling when finished arrives without viewStatusesCount (counts race), then exits on the counted poll', async () => {
    // `finished` with no counts is a race with the counts not being written
    // yet - defaulting them to 0 would declare a false GREEN, so the poll
    // treats it as not-yet-terminal and the next (counted) poll decides.
    mockGraphqlResponse(200, buildResponse('finished'));
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

    expect(mockFetch).toHaveBeenCalledTimes(2);
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

    // A build the caller already flagged as server-bypassed off the openBuild
    // counts (SHERLO-1952) passes `serverBypassed: true` - that is how testBundled
    // invokes it in the real flow. The poll response is set up per test via
    // mockGraphqlResponse before this is called.
    function bypassedBuild() {
      return waitForBuildResult({
        token: TOKEN,
        buildIndex: BUILD_INDEX,
        projectIndex: PROJECT_INDEX,
        teamId: TEAM_ID,
        serverBypassed: true,
      });
    }

    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it('pins the compact bypassed closer and the absence of all device-run output', async () => {
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

      const promise = bypassedBuild();

      await vi.runAllTimersAsync();
      const result = await promise;

      // The exit-code contract is unchanged: a closed, clean build is GREEN.
      expect(result).toBe(EXIT_GREEN);

      const printed = printedOutput(logSpy);
      expect(printed).toMatchSnapshot();

      // Absence assertions are the point of SHERLO-1952: no wait theatre, no URL.
      expect(printed).not.toContain('Waiting for build results');
      expect(printed).not.toContain('🟢 Finished');
      expect(printed).not.toContain('http'); // neither a review nor a build URL
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

      const promise = bypassedBuild();

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe(EXIT_GREEN);

      const printed = printedOutput(logSpy);
      expect(printed).toContain('Nothing needed capturing');
      // The platform reason is printed verbatim, INLINE in the headline.
      expect(printed).toContain('✅ Nothing needed capturing - no change reaches any story');
      // The fixed dim line replaces the old CLI-invented "every screenshot was
      // reused" sentence.
      expect(printed).toContain('closed by the server - no device run was needed');
      expect(printed).not.toContain('every screenshot was reused');
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

      const promise = bypassedBuild();

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

      const promise = bypassedBuild();

      await vi.runAllTimersAsync();
      await promise;

      const printed = printedOutput(logSpy);
      expect(printed).toContain('Nothing needed capturing');
      expect(printed).toContain('no change reaches any story');
    });

    it('falls back to the generic green message when diffScopeInfo is absent', async () => {
      // Not a bypass at openBuild (no counts) -> serverBypassed omitted -> today's
      // behaviour, waiting line included.
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

    it('forward-compat degrade: counts say bypass but the poll carries no reason -> generic green, no link', async () => {
      // The gate condition (SHERLO-1952): 0 captured, >0 inherited, AND a
      // per-platform reason. Reason absent (older API) -> generic green
      // message. The caller still flags the bypass off the counts
      // (serverBypassed: true), so the wait theatre is suppressed. No ending
      // ever reprints the build link - it was already printed once, right
      // when the build became ready.
      mockGraphqlResponse(
        200,
        buildResponse(
          'finished',
          { approved: 5, noChanges: 10, reported: 0, unreviewed: 0 },
          undefined,
          { capturedSnapshotCount: 0, inheritedSnapshotCount: 15 }
        )
      );

      const promise = bypassedBuild();

      await vi.runAllTimersAsync();
      await promise;

      const printed = printedOutput(logSpy);
      expect(printed).toContain('All stories passed');
      expect(printed).not.toContain('Nothing needed capturing');
      expect(printed).not.toContain('http');
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

  /* ------------------------------------------------------------------ */
  /* LINK-ONCE-PER-PUSH - the build link is printed once, by the caller,  */
  /* right after the build is ready. No --wait ending (clean finish,      */
  /* timeout, or SIGINT) may reprint it.                                  */
  /* ------------------------------------------------------------------ */

  describe('epilogue never reprints the build link', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    function printedOutput(): string {
      return logSpy.mock.calls.map((call: unknown[]) => call[0] ?? '').join('\n');
    }

    it('clean finish (GREEN) does not reprint the link', async () => {
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
      expect(printedOutput()).not.toContain('http');
    });

    it('clean finish (BLOCK) does not reprint the link', async () => {
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
      expect(printedOutput()).not.toContain('http');
    });

    it('clean finish (ERROR) does not reprint the link', async () => {
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
      expect(printedOutput()).not.toContain('http');
    });

    it('TIMEOUT does not reprint the link', async () => {
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
        waitTimeoutMinutes: 1,
      });

      await vi.advanceTimersByTimeAsync(120_000);
      const result = await promise;

      expect(result).toBe(EXIT_TIMEOUT);
      expect(printedOutput()).not.toContain('http');
    }, 10_000);

    it('SIGINT does not reprint the link', async () => {
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
      });

      // Let the first poll land and the loop reach its sleep, then Ctrl-C.
      await vi.advanceTimersByTimeAsync(0);
      process.emit('SIGINT', 'SIGINT');
      await vi.advanceTimersByTimeAsync(0);

      const result = await promise;

      expect(result).toBe(EXIT_SIGINT);
      expect(printedOutput()).not.toContain('http');
    });

    it('AuthError at poll time does not reprint the link', async () => {
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
      expect(printedOutput()).not.toContain('http');
    });
  });
});

/* ========================================================================== */
/* fetchServerBypassReason - the non-wait single-shot reason read (SHERLO-1952) */
/*                                                                              */
/* This is the function guard rail 2 rests on: it must degrade EVERY failure    */
/* (network, auth, timeout, malformed, or simply no per-platform reason) to     */
/* `undefined` and NEVER throw, so the closing of a build that actually         */
/* succeeded can never be turned into a failure by a cosmetic display query.    */
/* Tested directly here (the testBundled tests mock it out and so cannot catch  */
/* it throwing). Real timers - the mocked fetch resolves synchronously.         */
/* ========================================================================== */

describe('fetchServerBypassReason', () => {
  const args = {
    token: TOKEN,
    buildIndex: BUILD_INDEX,
    projectIndex: PROJECT_INDEX,
    teamId: TEAM_ID,
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns the verbatim per-platform reason for a bypassed poll shape', async () => {
    mockGraphqlResponse(
      200,
      buildResponse(
        'finished',
        { approved: 0, noChanges: 3, reported: 0, unreviewed: 0 },
        undefined,
        {
          capturedSnapshotCount: 0,
          inheritedSnapshotCount: 15,
          platforms: { android: { reason: 'no change reaches any story' } },
        }
      )
    );

    await expect(fetchServerBypassReason(args)).resolves.toBe('no change reaches any story');
  });

  it('resolves undefined (never throws) when the request rejects - network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(fetchServerBypassReason(args)).resolves.toBeUndefined();
  });

  it('resolves undefined (never throws) on an auth failure - an expired token must not turn a green build red', async () => {
    // fetchBuildStatus throws AuthError on HTTP 401; fetchServerBypassReason must
    // convert that into undefined rather than let it escape.
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
    });

    await expect(fetchServerBypassReason(args)).resolves.toBeUndefined();
  });

  it('resolves undefined for a non-bypassed shape (counts do not match)', async () => {
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

    await expect(fetchServerBypassReason(args)).resolves.toBeUndefined();
  });

  it('resolves undefined for a bypassed shape carrying no per-platform reason', async () => {
    mockGraphqlResponse(
      200,
      buildResponse(
        'finished',
        { approved: 5, noChanges: 10, reported: 0, unreviewed: 0 },
        undefined,
        {
          capturedSnapshotCount: 0,
          inheritedSnapshotCount: 15,
        }
      )
    );

    await expect(fetchServerBypassReason(args)).resolves.toBeUndefined();
  });

  it('makes EXACTLY ONE request and passes the 10s timeout to fetch (a read, not a poll)', async () => {
    mockGraphqlResponse(
      200,
      buildResponse(
        'finished',
        { approved: 0, noChanges: 1, reported: 0, unreviewed: 0 },
        undefined,
        {
          capturedSnapshotCount: 0,
          inheritedSnapshotCount: 4,
          platforms: { ios: { reason: 'nothing changed' } },
        }
      )
    );

    await fetchServerBypassReason(args);

    // One shot - a regression that turned this into a retry loop must fail here.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // The single call is bounded so a wedged API cannot hang a non-wait run.
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ timeout: 10_000 });
  });
});
