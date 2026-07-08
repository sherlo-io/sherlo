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
  } | null;
};

async function waitForBuildResult({
  token,
  buildIndex,
  projectIndex,
  teamId,
  waitTimeoutMinutes,
}: {
  token: string;
  buildIndex: number;
  projectIndex: number;
  teamId: string;
  waitTimeoutMinutes?: number;
}): Promise<number> {
  const timeoutMs = (waitTimeoutMinutes ?? DEFAULT_WAIT_TIMEOUT_MINUTES) * 60 * 1000;
  const startTime = Date.now();
  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  const { apiToken } = getTokenParts(token);
  const endpointUrl = getEndpointUrl();

  console.log(
    chalk.dim(
      `⏳ Waiting for build results (timeout: ${
        waitTimeoutMinutes ?? DEFAULT_WAIT_TIMEOUT_MINUTES
      }min)...`
    )
  );

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

    // Print progress when status changes
    const progressLine = formatProgressLine(build);
    if (progressLine !== lastStatus) {
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
  const { runStatus, viewStatusesCount } = build;

  switch (runStatus) {
    case 'finished': {
      const unreviewed = viewStatusesCount?.unreviewed ?? 0;
      const reported = viewStatusesCount?.reported ?? 0;

      if (unreviewed === 0 && reported === 0) {
        console.log();
        console.log(chalk.green('✅ All stories passed - no visual changes require review.'));
        console.log(chalk.blue(`   ${url}`));
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
