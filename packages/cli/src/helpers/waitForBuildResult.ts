import fetch from 'node-fetch';
import type { BuildDetailsGitFacts } from '../render/buildView';
import { buildDetailsOf } from './buildDetails';
import getTokenParts from './getTokenParts';
import { emit } from './transcriptSink';
import { EXIT_BLOCK, EXIT_ERROR, EXIT_GREEN, EXIT_SIGINT, EXIT_TIMEOUT } from './exitCodes';
import { decideSparseBuildVerdict, routesThroughSparseVerdict } from './sparseBuildVerdict';

/*
 * The exit-code contract this loop returns under - including the ONE input on
 * which it used to disagree with the GitHub check, and how the sparse verdict
 * repairs that - lives in ./exitCodes, next to the codes themselves.
 */

const DEFAULT_WAIT_TIMEOUT_MINUTES = 45;
const POLL_INTERVAL_MS = 15_000; // fixed interval, no API hammering

/**
 * The `getBuildStatus` wire shape, exported because two things outside this file
 * must be typed against it and neither may keep its own copy: the sparse-build
 * verdict decider (helpers/sparseBuildVerdict.ts) and the verdict transcript
 * catalog, whose scripted states ARE poll responses. A scenario that could
 * describe a build the backend cannot shape would let a product design be
 * approved off a state that can never occur.
 */
export type BuildStatusResponse = {
  getBuildStatus: {
    runStatus: 'canceled' | 'error' | 'finished' | 'inProgress' | 'queued' | 'waiting';
    /**
     * THE GATE, and the CLI does not decide it - the server does.
     *
     * `true` means this build is one the sparse-build redesign governs: the
     * project opted in AND the build is on a non-main branch. Both halves are
     * folded in server-side and frozen onto the build record at openBuild, so
     * the CLI never has to know the branch axis and a build cannot change its
     * mind halfway through a poll loop.
     *
     * ABSENT OR `false` MEANS OFF, and off means byte-identical to what this
     * loop has always printed. Absent is the older-API case and must never be
     * read as opt-in - every project that has not opted in is on that path.
     *
     * There is exactly ONE such switch. The GitHub check reads this same
     * boolean off the same build record (`Build.showsOnlyBranchChanges`), which
     * is the whole point: two surfaces reading two flags is how the drift this
     * redesign repairs would come back. The per-project opt-in
     * (`Project.shouldShowOnlyBranchChanges`) is deliberately NOT on the wire -
     * it has no branch axis applied, so a CLI reading it would gate builds the
     * check does not.
     */
    showsOnlyBranchChanges?: boolean;
    /**
     * The build's review status, EXACTLY as the server's own `getBuildStatus`
     * util computes it - the same value `deriveBuildCheckState` hands the
     * GitHub check for a finished build.
     *
     * WHY THE CLI READS THIS RATHER THAN COMPUTING GREENNESS ITSELF. The defect
     * the sparse redesign repairs is two surfaces deriving one build's verdict
     * from the same tally by two different formulas. Adding a third formula
     * here - however carefully written - would be the same mistake one layer
     * further out. So on the gated path the CLI stops deciding greenness and
     * mirrors the server's answer, and the two cannot drift by construction.
     *
     * Spelled inline rather than imported from `@sherlo/api-types`'s `Status`
     * for the same reason every other field of this wire shape is: this type
     * describes what THIS query selects. It is the same four values.
     *
     * Absent on an older API -> the gated path degrades to today's count-based
     * logic rather than inventing a verdict from a field nobody sent.
     */
    status?: 'approved' | 'noChanges' | 'reported' | 'unreviewed';
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
    /**
     * The build's frozen git identity (view-metadata, operator ruling
     * 2026-09-03) - only the two fields `getBuildStatus` sends. Absent on an
     * older API.
     */
    gitInfo?: {
      branchName: string;
      commitHash: string;
    };
    /**
     * Per-story rows (view-metadata, operator ruling 2026-09-03): what `sherlo
     * view --metadata` prints as `stories[]`. `status` is spelled as the plain
     * string the wire sends (including the hyphenated `"review-required"`)
     * rather than a narrowed union, because `@sherlo/api-types` is not the
     * source of this hand-written wire shape (see this file's module doc) and a
     * value this CLI has not learned yet must still pass through rather than
     * fail to parse. Absent for a build with no view rows yet.
     */
    stories?: {
      name: string;
      status: string;
      baseline: { buildIndex: number } | null;
      reason?: string;
      candidates?: { buildIndex: number }[];
    }[];
    /**
     * The Diff Scope block (view-metadata, operator ruling 2026-09-03): what
     * `sherlo view --metadata` prints as `diffScope`. Hand-typed rather than
     * imported from `@sherlo/api-types` for the same reason every other field
     * of this wire shape is (see this file's module doc) - server commit
     * e7c7d5a (sherlo-api `feature/sherlo-3`) added it and the portal tarball
     * this repo builds against may not carry it yet. Absent on an older API.
     */
    diffScope?: {
      reason: string;
      captured: string[];
      inherited: string[];
      ancestorBuildIndex: number | null;
    };
  } | null;
};

/** One poll answer for a build that exists, as the loop and the deciders see it. */
export type BuildStatus = NonNullable<BuildStatusResponse['getBuildStatus']>;

async function waitForBuildResult({
  token,
  buildIndex,
  projectIndex,
  teamId,
  waitTimeoutMinutes,
  serverBypassed = false,
  metadata,
  now = Date.now,
  pollBuildStatus,
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
  /**
   * `--metadata`: print the `── details ──` block after the terminal closer.
   *
   * PRESENCE IS THE REQUEST. `undefined` prints no block at all; `{}` prints one
   * carrying only what the poll answer itself knows. The block is emitted ONLY
   * for a build that reached a terminal state - a deadline, a Ctrl-C and a
   * refused credential end the wait with no build to describe, and a details
   * block about a build nobody looked at would be worse than none.
   *
   * `git` is the one fact the poll cannot serve: `getBuildStatus` does not
   * return the build's git info. A caller that OPENED this build composed that
   * info itself and hands it over here; `sherlo view` cannot, and passes `{}`.
   */
  metadata?: { git?: BuildDetailsGitFacts };
  /**
   * The ONE effect this loop performs, injectable so a caller can supply the
   * answers instead of the network.
   *
   * It exists for the transcript producer (commands/test/renderVerdictTranscript.ts),
   * which renders this family's expectations by running THIS function - the
   * shipped one - over a scripted sequence of poll answers. Substituting the
   * poll and nothing else is what keeps a rendered transcript evidence about the
   * CLI rather than about the producer: every branch, every dedupe and every
   * literal below is still the shipped one.
   *
   * Absent (the shipped path) it is the real GraphQL read, and both the token
   * parsing and the endpoint resolution happen inside it - so an injected poll
   * needs neither a real token nor a resolvable SDK env file.
   */
  pollBuildStatus?: () => Promise<BuildStatus | null>;
}): Promise<number> {
  const timeoutMs = (waitTimeoutMinutes ?? DEFAULT_WAIT_TIMEOUT_MINUTES) * 60 * 1000;
  const startTime = now();
  const deadline = startTime + timeoutMs;

  // Resolved ONCE, before the loop, exactly where the token parse and the
  // endpoint read happened before this parameter existed - so a malformed token
  // still throws out of the call rather than inside the loop's retry catch,
  // where it would be mistaken for a transient network blip and retried forever.
  const poll = pollBuildStatus ?? realPoll();

  function realPoll(): () => Promise<BuildStatus | null> {
    const { apiToken } = getTokenParts(token);
    const endpointUrl = getEndpointUrl();
    return () =>
      fetchBuildStatus(endpointUrl, apiToken, { index: buildIndex, projectIndex, teamId });
  }

  const timeoutMinutes = waitTimeoutMinutes ?? DEFAULT_WAIT_TIMEOUT_MINUTES;

  if (!serverBypassed) {
    emit({ kind: 'wait-header', timeoutMinutes });
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
    emit({ kind: 'blank-line' });
    emit({ kind: 'wait-interrupted' });
    emit({ kind: 'blank-line' });
    return EXIT_SIGINT;
  };

  try {
    while (true) {
      // Check timeout before each poll
      if (now() >= deadline) {
        emit({ kind: 'blank-line' });
        emit({ kind: 'wait-timed-out', timeoutMinutes });
        emit({ kind: 'blank-line' });
        return EXIT_TIMEOUT;
      }

      let build: NonNullable<BuildStatusResponse['getBuildStatus']> | null = null;

      try {
        const polled = await Promise.race([
          poll().then((result) => ({ type: 'result' as const, result })),
          sigint.promise.then(() => ({ type: 'sigint' as const })),
        ]);

        if (polled.type === 'sigint') {
          return printSigintCloser();
        }

        build = polled.result;
      } catch (error) {
        // Auth failures are not retryable - stop immediately
        if (error instanceof AuthError) {
          emit({ kind: 'blank-line' });
          emit({ kind: 'wait-auth-failed', message: error.message });
          emit({ kind: 'blank-line' });
          return EXIT_ERROR;
        }

        // Transient network blips are retried.
        //
        // ⚠ AND SO IS EVERY OTHER NON-AUTH ERROR, INCLUDING A PERMANENT ONE.
        // This branch cannot tell a dropped packet from a GraphQL
        // `Cannot query field` - so a CLI that selects a field its API does not
        // know does not fail fast, it retries every 15s until --wait-timeout and
        // exits 3 after 45 minutes of nothing.
        //
        // THE RULE THAT FALLS OUT, for anyone adding to the query below: an
        // additive selection is only safe once the schema carrying it is
        // DEPLOYED. That is not specific to the sparse-verdict fields
        // (`status`, `showsOnlyBranchChanges`) - it is true of every future
        // field, which is why it is written here at the hazard rather than in
        // the commit that happened to hit it first.
        emit({ kind: 'wait-network-retry', message: (error as Error).message });
        if ((await sleepUnlessInterrupted()) === 'sigint') {
          return printSigintCloser();
        }
        continue;
      }

      if (!build) {
        emit({ kind: 'wait-build-not-found' });
        if ((await sleepUnlessInterrupted()) === 'sigint') {
          return printSigintCloser();
        }
        continue;
      }

      // Print progress when status changes. Suppressed for a server-bypassed build
      // (SHERLO-1952): its only progress line would be "🟢 Finished", which implies
      // a device run that never happened.
      // Deduped on the wire's `runStatus` rather than on the rendered line. The
      // two are equivalent - each status renders to its own distinct label - and
      // deduping on STATE keeps the loop from having to hold a rendered string.
      if (!serverBypassed && build.runStatus !== lastStatus) {
        emit({ kind: 'wait-progress', runStatus: build.runStatus });
        lastStatus = build.runStatus;
      }

      const exitCode = evaluateTerminalState(build);

      if (exitCode !== null) {
        if (metadata) {
          emit({ kind: 'build-details', details: buildDetailsOf(build, metadata.git) });
          emit({ kind: 'blank-line' });
        }
        return exitCode;
      }

      // Periodic heartbeat so CI systems never see 5+ min of silence
      pollCount++;
      if (pollCount % 20 === 0) {
        emit({
          kind: 'wait-heartbeat',
          statusLabel: build.runStatus === 'inProgress' ? 'running' : build.runStatus,
          elapsedMinutes: Math.round((now() - startTime) / 60_000),
        });
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
      // ⚠ THIS IS THE SECOND `getBuildStatus` DOCUMENT, AND THE OTHER ONE IS IN
      // ANOTHER REPO: sherlo-api-full's sdk client ships its own at
      // packages/clients/sdk/src/requests/queries/getBuildStatus.ts.
      //
      // The duplication is deliberate, not an oversight. This poll is issued
      // over raw node-fetch because it needs three things the sdk client does
      // not give it: 401/403 mapped to a non-retryable AuthError, a per-request
      // timeout for the single-shot bypass read, and errors surfaced rather
      // than thrown as opaque client failures. All three are load-bearing for
      // the exit-code contract.
      //
      // THE COST IS THAT A FIELD ADDED THERE DOES NOT ARRIVE HERE. Both
      // documents have to be kept in step by hand, so a schema change that this
      // loop should see must be added to the selection below as well.
      query: `
        query getBuildStatus($index: Int!, $projectIndex: Int!, $teamId: String!) {
          getBuildStatus(index: $index, projectIndex: $projectIndex, teamId: $teamId) {
            runStatus
            showsOnlyBranchChanges
            status
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
            gitInfo {
              branchName
              commitHash
            }
            stories {
              name
              status
              baseline {
                buildIndex
              }
              reason
              candidates {
                buildIndex
              }
            }
            diffScope {
              reason
              captured
              inherited
              ancestorBuildIndex
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

      // THE GATE. A build the server did not mark - which is every build of
      // every project that has not opted in, and every build answered by an API
      // that predates the field - skips this entirely and falls through to the
      // block below, which is unchanged to the byte.
      if (routesThroughSparseVerdict(build)) {
        return closeUnderSparseRules(build);
      }

      const unreviewed = viewStatusesCount.unreviewed;
      const reported = viewStatusesCount.reported;

      if (unreviewed === 0 && reported === 0) {
        emit({ kind: 'blank-line' });
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
          emit({ kind: 'verdict-passed' });
        }
        emit({ kind: 'blank-line' });
        return EXIT_GREEN;
      }

      emit({ kind: 'blank-line' });
      emit({ kind: 'verdict-review-required', unreviewed, reported });
      emit({ kind: 'blank-line' });
      return EXIT_BLOCK;
    }

    case 'error':
    case 'canceled': {
      emit({ kind: 'blank-line' });
      emit({ kind: 'verdict-run-errored', runStatus, runError: build.runError });
      emit({ kind: 'blank-line' });
      return EXIT_ERROR;
    }

    default:
      // queued, waiting, inProgress - still running
      return null;
  }
}

/**
 * The finished branch for a build the server marked `showsOnlyBranchChanges` -
 * the sparse-build redesign's CLI half, and the ONLY new closing path in this
 * file.
 *
 * It emits the same frame every closer in this loop has always sat inside (one
 * blank line above, one below), and inside it either the sparse verdict's
 * segments or - when the build is one the SERVER closed without a device run -
 * that build's existing compact closer, carrying the server's own prose. The
 * bypass keeps precedence deliberately: it is a MORE specific green than
 * `noChanges`, it already ships, and a project that opted into sparse builds
 * must not lose the one sentence the CLI has that explains why nothing ran.
 * Its exit code is `EXIT_GREEN` on both paths, so precedence changes the words
 * and never the verdict.
 *
 * `null` means "not terminal, poll again", the same answer the ungated branch
 * gives for a counts race. It is unreachable from the current call site (which
 * has already checked both) and is returned rather than assumed, because a
 * false GREEN is the one answer that must never be reachable by accident.
 */
function closeUnderSparseRules(
  build: NonNullable<BuildStatusResponse['getBuildStatus']>
): number | null {
  const verdict = decideSparseBuildVerdict(build);
  if (!verdict) {
    return null;
  }

  emit({ kind: 'blank-line' });

  const serverBypassReason = getServerBypassReason(build.diffScopeInfo);
  if (verdict.exitCode === EXIT_GREEN && serverBypassReason) {
    printServerBypassCloser(serverBypassReason);
  } else {
    for (const segment of verdict.segments) {
      emit(segment);
    }
  }

  emit({ kind: 'blank-line' });
  return verdict.exitCode;
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
  emit({ kind: 'verdict-server-bypassed', reason });
}

/**
 * How long a SINGLE-SHOT read of a build's status may take before it is
 * abandoned. Generous enough for a healthy API, short enough that a wedged
 * endpoint cannot stall a run that is not waiting for anything.
 *
 * The poll loop above deliberately omits it - its own deadline governs there.
 */
const SINGLE_READ_TIMEOUT_MS = 10_000;

/**
 * Read a build's status ONCE - the read `sherlo view` is built on, and the same
 * query the `--wait` loop polls (`fetchBuildStatus`), so there is one wire shape
 * and one document to keep in step.
 *
 * `null` means the build does not exist, which is a real answer a caller acts
 * on. EVERY OTHER FAILURE THROWS, unlike {@link fetchServerBypassReason}: that
 * one is a cosmetic closing query on a run that already succeeded, while this
 * one IS the command's answer - a `view` that swallowed a refused credential
 * would print nothing and exit as though all was well.
 */
export async function readBuildStatus({
  token,
  buildIndex,
  projectIndex,
  teamId,
}: {
  token: string;
  buildIndex: number;
  projectIndex: number;
  teamId: string;
}): Promise<BuildStatus | null> {
  const { apiToken } = getTokenParts(token);

  return fetchBuildStatus(
    getEndpointUrl(),
    apiToken,
    { index: buildIndex, projectIndex, teamId },
    SINGLE_READ_TIMEOUT_MS
  );
}

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
      SINGLE_READ_TIMEOUT_MS
    );
    return getServerBypassReason(build?.diffScopeInfo);
  } catch {
    return undefined;
  }
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
