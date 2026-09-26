/**
 * `sherlo test --dry-run` orchestration + formatting (SHERLO-1895 Diff Scope
 * Phase C).
 *
 * A dry run bundles and produces the manifest locally exactly like a normal
 * a live staged run (the SAME real bundling path, not a synthetic manifest), then
 * asks the server - read-only, in ONE call for all platforms - which stories a
 * real run WOULD capture, prints the per-platform decision, and STOPS. It
 * creates no build, advances no ancestry, uploads nothing, and does not persist
 * the manifest server-side. It works even when the project's Diff Scope flag
 * is OFF: a preview is not enablement.
 *
 * BAIL-OPEN is the spine: every uncertainty resolves toward "a real run would
 * capture EVERY story", never a confident wrong partial. Two shapes of
 * "everything" arrive here, and BOTH render as capture-everything:
 *   - a CONFIDENT full capture: the server answered `isFullCapture: true` with a
 *     rung-code reason (main-branch, native-changed, manifest-missing, …) - or
 *     its own in-band error, `reason: "dry-run-error: <message>"`;
 *   - a CLI bail-open: we could not ask a trustworthy question at all - either
 *     the decision query threw (method absent, network, malformed/null
 *     response), or the git read itself failed
 *     ({@link isGitInfoUnavailable}), so `gitInfo` carries no real commit/branch
 *     identity to key a decision on. EITHER WAY the query is never trusted with
 *     an answer it cannot honestly give, and every platform previews as
 *     capture-everything with NO reason attached - never the server's own
 *     "why", which describes ITS certainty, not the CLI's.
 *
 * The server's reasons are PATH-LEGIBLE on a partial (they name source paths,
 * e.g. `captured 2 - closure changed via src/components/Storefront/SharedButton.tsx`)
 * and are printed VERBATIM - never re-rendered into module numbers.
 */
import { Platform } from '@sherlo/api-types';
import reporting from '../../helpers/reporting';
import { emit } from '../../helpers/transcriptSink';
import { isGitInfoUnavailable, type GitInfo } from '../../helpers/getGitInfo';
import type { BundleResult } from './buildBundle';
import { requestDryRunDecision, type DryRunPlatformRequest } from './dryRunDecision';

/**
 * The preview shape and its formatter live in the render layer now
 * (../../render/dryRunPlan). Re-exported here so every existing importer of
 * `DryRunPlatformPreview` keeps its import path - the move is a move, not a
 * rename campaign.
 */
import type { DryRunPlatformPreview } from '../../render/dryRunPlan';
export type { DryRunPlatformPreview };
export { formatDryRunPreview } from '../../render/dryRunPlan';

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Run the dry-run preview for every platform and print it. Never opens a build,
 * uploads nothing, and never throws for a decision problem - it bails open (all
 * platforms) on any decision-query failure.
 */
export async function runDryRunPreview({
  token,
  bundles,
  platformsToTest,
  projectIndex,
  teamId,
  gitInfo,
  baseReference,
  include,
  exclude,
}: {
  /** The raw project token - the seam builds its own sdk client from it (../../seams/serverCalls). */
  token: string;
  bundles: Partial<Record<Platform, BundleResult>>;
  platformsToTest: Platform[];
  projectIndex: number;
  teamId: string;
  /** The SAME git info openBuild is given - passed straight through to the query. */
  gitInfo: GitInfo;
  /**
   * This run's base identity (the base fingerprint), or undefined/empty when
   * none was computed. Absent -> the server previews native-changed (full).
   */
  baseReference?: string;
  /**
   * The config's include/exclude lists - the SAME narrowing a real build sends via
   * getBuildRunConfig, passed straight through to the query. Absent when the config names none.
   */
  include?: string[];
  exclude?: string[];
}): Promise<void> {
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Running sherlo test --dry-run preview',
    data: { teamId, projectIndex, platforms: platformsToTest },
    level: 'info',
  });

  let previews: DryRunPlatformPreview[];

  if (isGitInfoUnavailable(gitInfo)) {
    // The git read itself failed (see ../../helpers/getGitInfo), so `gitInfo` carries no real
    // commit/branch identity. Asking the server a diff-scope question keyed on "unknown"/"unknown"
    // would get back an honest answer to a question we made up, not to this project's actual
    // history - and printing that answer's reason would read as a confident claim about the
    // project when the truth is the CLI couldn't tell. Bail open WITHOUT asking.
    previews = bailOpenForEveryPlatform(
      platformsToTest,
      'the git read failed, so the decision has no commit/branch identity to key on'
    );
  } else {
    // One request carries every platform. A platform whose build produced no
    // manifest is NOT dropped and NOT special-cased locally: it is sent with an
    // absent manifest, and the server previews it as manifest-missing (full).
    const platforms: DryRunPlatformRequest[] = platformsToTest.map((platform) => ({
      platform,
      bundled: true,
      baseReference: baseReference || undefined,
      manifest: bundles[platform]?.moduleManifest,
    }));

    try {
      const decisions = await requestDryRunDecision({
        token,
        gitInfo,
        projectIndex,
        teamId,
        platforms,
        include,
        exclude,
      });

      // Key previews off platformsToTest so ordering is deterministic and a
      // platform the server omitted still gets a (bail-open) block, never a drop.
      previews = platformsToTest.map((platform) => {
        const decision = decisions.find((d) => d.platform === platform);
        if (!decision) {
          return {
            status: 'bailed-open',
            platform,
            reason: 'the dry-run decision returned no result for this platform',
          };
        }
        return { status: 'decided', decision };
      });
    } catch (error) {
      // Any decision-query failure bails open for EVERY platform. The preview still
      // completes; the safe answer ("would capture everything") is shown for each.
      const reason = error instanceof Error ? error.message : String(error);
      previews = bailOpenForEveryPlatform(platformsToTest, reason);
    }
  }

  emit({ kind: 'dry-run-capture-plan', previews });
}

/**
 * Preview every platform as a bail-open: "would capture everything", with the reason kept OFF the
 * user's line (it stays in the breadcrumb) so the render layer falls to its own "couldn't compute
 * what changed" safety row rather than a reason meant for telemetry. Shared by every trigger of
 * the ONE bail-open class this module has - the git read failing and the decision query failing -
 * so a caller can never tell the two apart from the printed output, only from the breadcrumb.
 */
function bailOpenForEveryPlatform(
  platformsToTest: Platform[],
  reason: string
): DryRunPlatformPreview[] {
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Dry-run decision bailed open',
    data: { platforms: platformsToTest, reason },
    level: 'warning',
  });
  return platformsToTest.map((platform) => ({ status: 'bailed-open', platform, reason }));
}

export default runDryRunPreview;
