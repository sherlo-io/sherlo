import fetch from 'node-fetch';
import chalk from 'chalk';
import getAppBuildUrl from './getAppBuildUrl';
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
}: {
  token: string;
  buildIndex: number;
  projectIndex: number;
  teamId: string;
  waitTimeoutMinutes?: number;
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
  const startTime = Date.now();
  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

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

  while (true) {
    // Check timeout before each poll
    if (Date.now() - startTime > timeoutMs) {
      console.log();
      console.log(
        chalk.yellow(
          `⏰ Timeout reached after ${waitTimeoutMinutes ?? DEFAULT_WAIT_TIMEOUT_MINUTES} minutes.`
        )
      );
      console.log(chalk.yellow('   The build may still be running. Check the dashboard:'));
      console.log(chalk.blue(`   ${url}`));
      console.log();
      return EXIT_TIMEOUT;
    }

    let build: NonNullable<BuildStatusResponse['getBuildStatus']> | null = null;

    try {
      build = await fetchBuildStatus(endpointUrl, apiToken, {
        index: buildIndex,
        projectIndex,
        teamId,
      });
    } catch (error) {
      // Auth failures are not retryable - stop immediately
      if (error instanceof AuthError) {
        console.log();
        console.log(chalk.red(`🔒 ${error.message}`));
        console.log(chalk.blue(`   Dashboard: ${url}`));
        console.log();
        return EXIT_ERROR;
      }

      // Transient network blips are retried
      console.log(chalk.dim(`   Network error, retrying... (${(error as Error).message})`));
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (!build) {
      console.log(chalk.dim('   Build not found, retrying...'));
      await sleep(POLL_INTERVAL_MS);
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

    const exitCode = evaluateTerminalState(build, url);

    if (exitCode !== null) {
      return exitCode;
    }

    // Periodic heartbeat so CI systems never see 5+ min of silence
    pollCount++;
    if (pollCount % 20 === 0) {
      const elapsedMin = Math.round((Date.now() - startTime) / 60_000);
      const statusLabel = build.runStatus === 'inProgress' ? 'running' : build.runStatus;
      console.log(chalk.dim(`   still ${statusLabel}... (${elapsedMin}m elapsed)`));
    }

    await sleep(POLL_INTERVAL_MS);
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
  variables: { index: number; projectIndex: number; teamId: string }
): Promise<NonNullable<BuildStatusResponse['getBuildStatus']> | null> {
  const response = await fetch(endpointUrl, {
    method: 'POST',
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
  build: NonNullable<BuildStatusResponse['getBuildStatus']>,
  url: string
): number | null {
  const { runStatus, viewStatusesCount, diffScopeInfo } = build;

  switch (runStatus) {
    case 'finished': {
      const unreviewed = viewStatusesCount?.unreviewed ?? 0;
      const reported = viewStatusesCount?.reported ?? 0;

      if (unreviewed === 0 && reported === 0) {
        console.log();
        const serverBypassReason = getServerBypassReason(diffScopeInfo);
        if (serverBypassReason) {
          // Server-bypassed build (SHERLO-1952): there is nothing to review (zero
          // new screenshots) and the review page cannot render this build shape
          // yet (SHERLO-1974), so the closer stays compact and points at no URL.
          // The reason is the server's verbatim prose (SHERLO-1919) - the CLI
          // never composes it. The caller has already suppressed the review URL
          // (printCapturePlanAndCloser) when it flagged the bypass, so omitting
          // the URL here loses no link.
          console.log(chalk.green(`✅ Nothing needed capturing - ${serverBypassReason}`));
          console.log(chalk.dim('   closed by the server - no device run was needed'));
        } else {
          // No verbatim reason -> today's behaviour, keeping the link. Covers
          // both the forward-compat degrade of a counts-bypassed build whose poll
          // carries no prose (SHERLO-1952 gate: a working link beats silence) and
          // every ordinary green build.
          console.log(chalk.green('✅ All stories passed - no visual changes require review.'));
          console.log(chalk.blue(`   ${url}`));
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
      console.log(chalk.blue(`   Review here: ${url}`));
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
      console.log(chalk.blue(`   ${url}`));
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
 * `reason`). testBundled calls this at openBuild time to decide, BEFORE the first
 * poll, whether to suppress the "waiting"/"finished" lines and the review URL for
 * a build that never ran on a device (SHERLO-1952). The prose reason is not
 * needed for that decision and is not available at openBuild anyway; it is read
 * from the poll response by {@link getServerBypassReason}.
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

export default waitForBuildResult;
