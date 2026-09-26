/**
 * THE `getBuildStatus` WIRE READ - the one request behind every question the CLI asks about a
 * build that already exists.
 *
 * It lives in its own module because THREE callers share it and one of them is a seam: the
 * `--wait` poll loop, the single read `sherlo view` takes before it prints, and the single read a
 * server-bypassed build's closer takes (all in ./waitForBuildResult), reached through
 * ../seams/serverCalls so a pose can answer them instead of the network. Leaving it inside the
 * wait loop would have made that seam import the loop and the loop import the seam.
 *
 * WHY IT IS RAW node-fetch AND NOT THE SDK CLIENT: three things the client does not give it -
 * 401/403 mapped to a non-retryable {@link AuthError}, a per-request timeout for the single-shot
 * reads, and errors surfaced rather than thrown as opaque client failures. All three are
 * load-bearing for the exit-code contract.
 */
import fetch from 'node-fetch';

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
     * fail to parse. Absent for a build with no view rows yet on an older API.
     * `null` is what the server sends for a build whose run ended in `error`
     * before any view row existed (run 36186659445, sherlo-tester's Honest
     * Failure storyline, slot `errored-build`).
     */
    stories?:
      | {
          name: string;
          status: string;
          baseline: { buildIndex: number } | null;
          /** `null` is a row the wire sent with nothing to say - distinct from absent (an older API). */
          reason?: string | null;
          /** `null` is a row the wire sent with nothing to say - distinct from absent (an older API). */
          candidates?: { buildIndex: number }[] | null;
        }[]
      | null;
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

export function getEndpointUrl(): string {
  const sdkEnv = require('@sherlo/sdk-client/dist/env.json');
  return process.env.SHERLO_API_URL ?? sdkEnv.endpoints.url;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * How long a SINGLE-SHOT read of a build's status may take before it is abandoned. Generous
 * enough for a healthy API, short enough that a wedged endpoint cannot stall a run that is not
 * waiting for anything. The poll loop deliberately omits it - its own deadline governs there.
 */
export const SINGLE_READ_TIMEOUT_MS = 10_000;

export async function fetchBuildStatus(
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
