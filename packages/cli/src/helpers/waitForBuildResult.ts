import fetch from 'node-fetch';
import chalk from 'chalk';
import getTokenParts from './getTokenParts';

/*
 * EXIT CODE CONTRACT
 * =============================================================================
 * Mirrors the GitHub check-state mapping decided for the sherlo/visual-tests
 * check, so the CI exit code and the GitHub check conclusion never drift.
 *
 *   0 - GREEN:  build finished, every story noChanges or already approved
 *               (zero unreviewed, zero reported).
 *   1 - BLOCK:  build finished with unreviewed or reported/denied changes.
 *               A human must review in the dashboard.
 *   2 - ERROR:  build ended in a build/system error (infrastructure/capture
 *               failure, canceled, or authentication/permission denied).
 *   3 - TIMEOUT: --wait-timeout elapsed before reaching a terminal state.
 *               Conservative - timeout is a BLOCK, never a pass.
 *   130 - SIGINT: the user pressed Ctrl-C while waiting. The run keeps going
 *               in Sherlo; we stop cleanly and exit with the conventional
 *               128+SIGINT(2) code.
 *
 * GitHub check mapping (for reference):
 *   exit 0 → conclusion: "success"
 *   exit 1 → conclusion: "action_required"
 *   exit 2 → conclusion: "failure"
 *   exit 3 → conclusion: "action_required" (timeout)
 * =============================================================================
 */

export const EXIT_GREEN = 0;
export const EXIT_BLOCK = 1;
export const EXIT_ERROR = 2;
export const EXIT_TIMEOUT = 3;
export const EXIT_SIGINT = 130;

const DEFAULT_WAIT_TIMEOUT_MINUTES = 45;
const POLL_INTERVAL_MS = 15_000; // fixed interval, no API hammering

type BuildStatusResponse = {
  getBuildStatus: {
    runStatus: 'canceled' | 'error' | 'finished' | 'inProgress' | 'queued' | 'waiting';
    viewStatusesCount?: {
      approved: number;
      noChanges: number;
      reported: number;
      unreviewed: number;
    };
    runError?: unknown;
    /**
     * Build-wide Diff Scope capture accounting, mirrored off Build.diffScopeInfo
     * (same shape already used by BuildFragment/CloseBuildFragment elsewhere in
     * the API). Absent on older API responses -> the closing message degrades to
     * the generic "All stories passed" line (SHERLO-1962). A server-bypassed
     * build (SHERLO-1959: the runner never ran because the server already knew
     * every story's screenshot could be inherited) reports capturedSnapshotCount
     * 0, inheritedSnapshotCount equal to the whole suite, and a per-platform
     * `platforms.<platform>.reason` carrying the server's plain-prose explanation.
     *
     * We read `platforms.<platform>.reason`, NOT `fullCaptureTriggerReason`.
     * Per the API schema (build.graphql) `reason` is the operator-approved prose
     * the CLI prints verbatim, while `fullCaptureTriggerReason` is a machine enum
     * code that (a) is only set for FULL captures and so is always absent on a
     * bypassed build - which is a partial capture by definition - and (b) would
     * print a raw machine code if it ever were surfaced (SHERLO-1919/1963).
     */
    diffScopeInfo?: {
      capturedSnapshotCount?: number;
      inheritedSnapshotCount?: number;
      platforms?: {
        android?: { reason?: string };
        ios?: { reason?: string };
      };
    };
  } | null;
};

async function waitForBuildResult({
  token,
  buildIndex,
  projectIndex,
  teamId,
  waitTimeoutMinutes,
  serverBypassed = false,
  now = Date.now,
}: {
  token: string;
  buildIndex: number;
  projectIndex: number;
  teamId: string;
  waitTimeoutMinutes?: number;
  /**
   * Injectable clock so the deadline tests can stub time deterministically
   * instead of spying on the global `Date.now` - keeps them immune to any
   * other `Date.now` caller in the process (e.g. a test reporter timestamping
   * console output) under any test reporter.
   */
  now?: () => number;
  /**
   * The build was already closed server-side without ever running on a device
   * (SHERLO-1959/1952), detected off the openBuild counts by the caller. When
   * set we keep the poll and the exit-code contract EXACTLY as they are - the
   * build is already terminal, so the first poll returns immediately - but we
   * suppress the output that implies device work happened: the "waiting" line
   * below and the "🟢 Finished" progress line. The compact bypassed closer is
   * printed by evaluateTerminalState off the poll's verbatim reason.
   */
  serverBypassed?: boolean;
}): Promise<number> {
  const timeoutMs = (waitTimeoutMinutes ?? DEFAULT_WAIT_TIMEOUT_MINUTES) * 60 * 1000;
  const startTime = now();
  const deadline = startTime + timeoutMs;

  const { apiToken } = getTokenParts(token);
  const endpointUrl = getEndpointUrl();

  if (!serverBypassed) {
    console.log(
      chalk.dim(
        `⏳ Waiting for build results (timeout: ${
          waitTimeoutMinutes ?? DEFAULT_WAIT_TIMEOUT_MINUTES
        }min)...`
      )
    );
  }

  let lastStatus = '';
  let pollCount = 0;

  // Overrides Node's default "exit immediately" SIGINT behavior so the wait
  // loop can stop cleanly and exit(130) itself instead of killing the process
  // mid-print. The run keeps going in Sherlo.
  const sigint = createSigintSignal();

  // Every sleep in the loop is bounded to the remaining time until the
  // deadline, so a timeout fires on time instead of overshooting by up to one
  // poll interval - and is raced against SIGINT so Ctrl-C never has to wait
  // out a sleep.
  const sleepUnlessInterrupted = async (): Promise<'elapsed' | 'sigint'> => {
    const remainingMs = Math.max(deadline - now(), 0);
    return Promise.race([
      sleep(Math.min(POLL_INTERVAL_MS, remainingMs)).then(() => 'elapsed' as const),
      sigint.promise.then(() => 'sigint' as const),
    ]);
  };

  const printSigintCloser = (): number => {
    console.log();
    console.log(chalk.dim('Stopped waiting. The run is still going in Sherlo.'));
    console.log();
    return EXIT_SIGINT;
  };

  try {
    while (true) {
      // Check timeout before each poll
      if (now() >= deadline) {
        console.log();
        console.log(
          chalk.yellow(
            `⏰ Timeout reached after ${
              waitTimeoutMinutes ?? DEFAULT_WAIT_TIMEOUT_MINUTES
            } minutes.`
          )
        );
        console.log(chalk.yellow('   The build may still be running. Check the dashboard.'));
        console.log();
        return EXIT_TIMEOUT;
      }

      let build: NonNullable<BuildStatusResponse['getBuildStatus']> | null = null;

      try {
        const polled = await Promise.race([
          fetchBuildStatus(endpointUrl, apiToken, {
            index: buildIndex,
            projectIndex,
            teamId,
          }).then((result) => ({ type: 'result' as const, result })),
          sigint.promise.then(() => ({ type: 'sigint' as const })),
        ]);

        if (polled.type === 'sigint') {
          return printSigintCloser();
        }

        build = polled.result;
      } catch (error) {
        // Auth failures are not retryable - stop immediately
        if (error instanceof AuthError) {
          console.log();
          console.log(chalk.red(`🔒 ${error.message}`));
          console.log();
          return EXIT_ERROR;
        }

        // Transient network blips are retried
        console.log(chalk.dim(`   Network error, retrying... (${(error as Error).message})`));
        if ((await sleepUnlessInterrupted()) === 'sigint') {
          return printSigintCloser();
        }
        continue;
      }

      if (!build) {
        console.log(chalk.dim('   Build not found, retrying...'));
        if ((await sleepUnlessInterrupted()) === 'sigint') {
          return printSigintCloser();
        }
        continue;
      }

      // Print progress when status changes. Suppressed for a server-bypassed build
      // (SHERLO-1952): its only progress line would be "🟢 Finished", which implies
      // a device run that never happened.
      const progressLine = formatProgressLine(build);
      if (!serverBypassed && progressLine !== lastStatus) {
        console.log(progressLine);
        lastStatus = progressLine;
      }

      const exitCode = evaluateTerminalState(build);

      if (exitCode !== null) {
        return exitCode;
      }

      // Periodic heartbeat so CI systems never see 5+ min of silence
      pollCount++;
      if (pollCount % 20 === 0) {
        const elapsedMin = Math.round((now() - startTime) / 60_000);
        const statusLabel = build.runStatus === 'inProgress' ? 'running' : build.runStatus;
        console.log(chalk.dim(`   still ${statusLabel}... (${elapsedMin}m elapsed)`));
      }

      if ((await sleepUnlessInterrupted()) === 'sigint') {
        return printSigintCloser();
      }
    }
  } finally {
    sigint.cleanup();
  }
}

/* ========================================================================== */
/* INTERNALS                                                                   */
/* ========================================================================== */

function getEndpointUrl(): string {
  const sdkEnv = require('@sherlo/sdk-client/dist/env.json');
  return process.env.SHERLO_API_URL ?? sdkEnv.endpoints.url;
}

class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

async function fetchBuildStatus(
  endpointUrl: string,
  apiToken: string,
  variables: { index: number; projectIndex: number; teamId: string },
  // Single-shot callers (fetchServerBypassReason) bound the request so a slow API
  // can never hang a non-wait run. The poll loop omits it - its own outer timeout
  // governs - so the wait path is unchanged.
  timeoutMs?: number
): Promise<NonNullable<BuildStatusResponse['getBuildStatus']> | null> {
  const response = await fetch(endpointUrl, {
    method: 'POST',
    ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
    headers: {
      'Content-Type': 'application/json',
      Authorization: JSON.stringify({ authToken: apiToken }),
    },
    body: JSON.stringify({
      query: `
        query getBuildStatus($index: Int!, $projectIndex: Int!, $teamId: String!) {
          getBuildStatus(index: $index, projectIndex: $projectIndex, teamId: $teamId) {
            runStatus
            viewStatusesCount {
              approved
              noChanges
              reported
              unreviewed
            }
            runError
            diffScopeInfo {
              capturedSnapshotCount
              inheritedSnapshotCount
              platforms {
                android {
                  reason
                }
                ios {
                  reason
                }
              }
            }
          }
        }
      `,
      variables,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`Authentication failed (HTTP ${response.status}) - check your token`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as { data?: BuildStatusResponse; errors?: unknown[] };

  if (json.errors?.length) {
    const errorTypes = json.errors.map((e: any) => e?.errorType ?? '').filter(Boolean);
    const isAuthError = errorTypes.some((t: string) => /unauthorized|forbidden|auth/i.test(t));
    if (isAuthError) {
      throw new AuthError('Authentication failed - GraphQL authorization error. Check your token.');
    }
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data?.getBuildStatus ?? null;
}

function evaluateTerminalState(
  build: NonNullable<BuildStatusResponse['getBuildStatus']>
): number | null {
  const { runStatus, viewStatusesCount, diffScopeInfo } = build;

  switch (runStatus) {
    case 'finished': {
      // `viewStatusesCount` can arrive null/undefined on a just-finished poll
      // (a race with the counts not being written yet). Treat that as
      // not-yet-terminal so the next poll picks it up - defaulting the counts
      // to 0 here would declare a false GREEN.
      if (!viewStatusesCount) {
        return null;
      }

      const unreviewed = viewStatusesCount.unreviewed;
      const reported = viewStatusesCount.reported;

      if (unreviewed === 0 && reported === 0) {
        console.log();
        const serverBypassReason = getServerBypassReason(diffScopeInfo);
        if (serverBypassReason) {
          // Server-bypassed build (SHERLO-1952): there is nothing to review (zero
          // new screenshots) and the review page cannot render this build shape
          // yet (SHERLO-1974), so the closer stays compact and points at no URL.
          // The caller (printCapturePlanAndCloser) has already withheld the review
          // URL for a bypassed build, so omitting it here loses no link.
          printServerBypassCloser(serverBypassReason);
        } else {
          // No verbatim reason -> today's generic message. Covers the
          // forward-compat degrade of a counts-bypassed build whose poll carries
          // no prose, and every ordinary green build. The build's link was
          // already printed once, right when the build became ready - never
          // repeated here.
          console.log(chalk.green('✅ All stories passed - no visual changes require review.'));
        }
        console.log();
        return EXIT_GREEN;
      }

      console.log();
      console.log(chalk.yellow('⚠️  Build finished with changes requiring review.'));
      if (unreviewed > 0) {
        console.log(chalk.yellow(`   ${unreviewed} story/stories unreviewed.`));
      }
      if (reported > 0) {
        console.log(chalk.yellow(`   ${reported} story/stories reported.`));
      }
      console.log();
      return EXIT_BLOCK;
    }

    case 'error':
    case 'canceled': {
      console.log();
      console.log(chalk.red(`❌ Build ended in "${runStatus}" state.`));
      if (build.runError) {
        console.log(chalk.red(`   Error: ${JSON.stringify(build.runError)}`));
      }
      console.log();
      return EXIT_ERROR;
    }

    default:
      // queued, waiting, inProgress - still running
      return null;
  }
}

/**
 * Platforms consulted in this fixed order when picking the reason line for a
 * server-bypassed build. The order is explicit (not JSON key order) so the
 * output is deterministic; android is first only to match the field-declaration
 * order of DiffScopePlatformsInfo in the API schema. A server-bypassed build is
 * bypassed for the suite as a whole, so every present platform's reason
 * describes the same "nothing changed" verdict - we surface the first one that
 * carries prose and never merge or reformat it.
 */
const PLATFORM_REASON_ORDER = ['android', 'ios'] as const;

/**
 * The counts-only signature of a server-bypassed build (SHERLO-1959): zero
 * captures with at least one inherited snapshot. This is the SINGLE detection of
 * the bypass shape - it needs only the two counts, which are present both on the
 * poll response here AND on the openBuild response (BuildFragment selects
 * `capturedSnapshotCount`/`inheritedSnapshotCount` but NOT the per-platform
 * `reason`). testBundled calls this at openBuild time to decide whether to
 * withhold the review URL (both modes) and suppress the "waiting"/"finished"
 * lines (--wait only) for a build that never ran on a device (SHERLO-1952). The
 * prose reason is not needed for that decision and is not available at openBuild
 * anyway; it is read from a getBuildStatus response - the --wait poll's, or the
 * single non-wait call in {@link fetchServerBypassReason} - by
 * {@link getServerBypassReason}.
 */
export function isServerBypassed(
  diffScopeInfo:
    | { capturedSnapshotCount?: number; inheritedSnapshotCount?: number }
    | null
    | undefined
): boolean {
  return (
    diffScopeInfo?.capturedSnapshotCount === 0 && (diffScopeInfo?.inheritedSnapshotCount ?? 0) > 0
  );
}

/**
 * When the API server-bypassed the build (SHERLO-1959) - it already knew every
 * story's screenshot could be inherited from the previous build, so it closed
 * the build without ever handing it to the runner - return the plain-prose
 * reason line to print in the closing message; otherwise return undefined so the
 * caller falls back to the generic "All stories passed" line.
 *
 * Recognized off the SAME shape closeBuild persists (see the API unit test
 * closeAsZeroCaptureNoOp.unit.test.ts): the {@link isServerBypassed} counts plus
 * a per-platform prose `reason`. The reason is taken from
 * `platforms.<platform>.reason` - the operator-approved prose the CLI prints
 * verbatim - never from `fullCaptureTriggerReason`, which is a machine enum
 * code and is always absent on a bypassed (partial-capture) build anyway
 * (SHERLO-1963). An older API response with no `diffScopeInfo` (or no
 * `platforms.<platform>.reason`) yields undefined and degrades gracefully.
 */
function getServerBypassReason(
  diffScopeInfo: NonNullable<BuildStatusResponse['getBuildStatus']>['diffScopeInfo']
): string | undefined {
  if (!isServerBypassed(diffScopeInfo)) {
    return undefined;
  }

  for (const platform of PLATFORM_REASON_ORDER) {
    const reason = diffScopeInfo?.platforms?.[platform]?.reason;
    if (reason) {
      return reason;
    }
  }

  return undefined;
}

/**
 * The compact closer for a server-bypassed build (SHERLO-1952): the server's
 * verbatim reason inline in the headline, then the fixed dim line. No URL - the
 * build has nothing to review and the review page cannot render this shape yet
 * (SHERLO-1974). One definition, used by BOTH the --wait terminal path here and
 * the non-wait closer in testBundled, so the two modes print identical text.
 */
export function printServerBypassCloser(reason: string): void {
  console.log(chalk.green(`✅ Nothing needed capturing - ${reason}`));
  console.log(chalk.dim('   closed by the server - no device run was needed'));
}

/**
 * How long the single-shot bypass-reason query may take before it is abandoned.
 * Generous enough for a healthy API, short enough that a wedged endpoint cannot
 * stall a non-wait run.
 */
const BYPASS_REASON_QUERY_TIMEOUT_MS = 10_000;

/**
 * Fetch the server's verbatim bypass reason with ONE getBuildStatus call against
 * the already-closed build - the non-wait counterpart to the --wait poll, using
 * the SAME query/wire shape (`fetchBuildStatus`) so there is one place to change
 * if the shape moves. The build is already terminal server-side, so this returns
 * immediately; it is a single read, not a wait.
 *
 * Best-effort by contract (SHERLO-1952 guard rail): any failure - network, auth,
 * timeout, malformed response, or simply no per-platform reason - degrades to
 * `undefined`, and the caller falls back to today's review URL. A build that
 * succeeded must never be reported failed over this cosmetic closing query, so
 * nothing here is allowed to throw.
 */
export async function fetchServerBypassReason({
  token,
  buildIndex,
  projectIndex,
  teamId,
}: {
  token: string;
  buildIndex: number;
  projectIndex: number;
  teamId: string;
}): Promise<string | undefined> {
  try {
    const { apiToken } = getTokenParts(token);
    const build = await fetchBuildStatus(
      getEndpointUrl(),
      apiToken,
      { index: buildIndex, projectIndex, teamId },
      BYPASS_REASON_QUERY_TIMEOUT_MS
    );
    return getServerBypassReason(build?.diffScopeInfo);
  } catch {
    return undefined;
  }
}

function formatProgressLine(build: NonNullable<BuildStatusResponse['getBuildStatus']>): string {
  const { runStatus } = build;

  const statusLabel: Record<string, string> = {
    queued: '🟡 Queued',
    waiting: '🟡 Waiting',
    inProgress: '🔵 Running',
    finished: '🟢 Finished',
    error: '🔴 Error',
    canceled: '⚪ Canceled',
  };

  return chalk.dim(`   ${statusLabel[runStatus] ?? runStatus}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replaces Node's default "exit immediately" SIGINT behavior for the duration
 * of the wait: the returned promise resolves on the first Ctrl-C, letting the
 * poll loop stop cleanly and exit with {@link EXIT_SIGINT}. `cleanup` restores
 * the default by removing the listener.
 */
function createSigintSignal(): { promise: Promise<void>; cleanup: () => void } {
  let resolveSignal: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveSignal = resolve;
  });

  const handler = () => resolveSignal();
  process.once('SIGINT', handler);

  return { promise, cleanup: () => process.off('SIGINT', handler) };
}

export default waitForBuildResult;
