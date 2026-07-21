/**
 * `test:bundled --dry-run` orchestration + formatting (SHERLO-1895 Diff Scope
 * v2 Phase C).
 *
 * A dry run bundles and produces the manifest locally exactly like a normal
 * test:bundled (the SAME real bundling path, not a synthetic manifest), then
 * asks the server - read-only, in ONE call for all platforms - which stories a
 * real run WOULD capture, prints the per-platform decision, and STOPS. It
 * creates no build, advances no ancestry, uploads nothing, and does not persist
 * the manifest server-side. It works even when the project's Diff Scope v2 flag
 * is OFF: a preview is not enablement.
 *
 * BAIL-OPEN is the spine: every uncertainty resolves toward "a real run would
 * capture EVERY story", never a confident wrong partial. Two shapes of
 * "everything" arrive here, and BOTH render as capture-everything:
 *   - a CONFIDENT full capture: the server answered `isFullCapture: true` with a
 *     rung-code reason (main-branch, native-changed, manifest-missing, …) - or
 *     its own in-band error, `reason: "dry-run-error: <message>"`;
 *   - a CLI bail-open: the decision query threw (method absent, network,
 *     malformed/null response), so we could not get a trustworthy answer for ANY
 *     platform and preview every one as capture-everything.
 *
 * The server's reasons are PATH-LEGIBLE on a partial (they name source paths,
 * e.g. `captured 2 - closure changed via src/components/Storefront/SharedButton.tsx`)
 * and are printed VERBATIM - never re-rendered into module numbers.
 */
import { Platform } from '@sherlo/api-types';
import reporting from '../../helpers/reporting';
import { PLATFORM_LABEL } from '../../constants';
import type { GitInfo } from '../../helpers/getGitInfo';
import type { BundleResult } from './buildBundle';
import {
  requestDryRunDecision,
  type DryRunDecisionClient,
  type DryRunPlatformDecision,
  type DryRunPlatformRequest,
} from './dryRunDecision';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One platform's preview outcome: either a decision from the server (which may
 * itself be a confident full capture), or a CLI bail-open (we could not get a
 * trustworthy answer at all, so a real run would capture everything).
 */
export type DryRunPlatformPreview =
  | { status: 'decided'; decision: DryRunPlatformDecision }
  | { status: 'bailed-open'; platform: Platform; reason: string };

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Run the dry-run preview for every platform and print it. Never opens a build,
 * uploads nothing, and never throws for a decision problem - it bails open (all
 * platforms) on any decision-query failure.
 */
export async function runDryRunPreview({
  client,
  bundles,
  platformsToTest,
  projectIndex,
  teamId,
  gitInfo,
  baseReference,
}: {
  client: DryRunDecisionClient;
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
}): Promise<void> {
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Running test:bundled --dry-run preview',
    data: { teamId, projectIndex, platforms: platformsToTest },
    level: 'info',
  });

  // One request carries every platform. A platform whose build produced no
  // manifest is NOT dropped and NOT special-cased locally: it is sent with an
  // absent manifest, and the server previews it as manifest-missing (full).
  const platforms: DryRunPlatformRequest[] = platformsToTest.map((platform) => ({
    platform,
    bundled: true,
    baseReference: baseReference || undefined,
    manifest: bundles[platform]?.moduleManifest,
  }));

  let previews: DryRunPlatformPreview[];
  try {
    const decisions = await requestDryRunDecision({
      client,
      gitInfo,
      projectIndex,
      teamId,
      platforms,
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
    reporting.addBreadcrumb({
      category: 'api',
      message: 'Dry-run decision bailed open',
      data: { platforms: platformsToTest, reason },
      level: 'warning',
    });
    previews = platformsToTest.map((platform) => ({ status: 'bailed-open', platform, reason }));
  }

  console.log(formatDryRunPreview(previews));
}

export default runDryRunPreview;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Render the whole dry-run preview as a plain-text block (no color - the caller
 * prints it as-is, and tests assert on it directly). Header, one block per
 * platform, then a footer making the read-only nature explicit.
 */
export function formatDryRunPreview(previews: DryRunPlatformPreview[]): string {
  const lines: string[] = [];

  lines.push('📋 Diff Scope preview - dry run (no build created)');

  for (const preview of previews) {
    lines.push('');
    if (preview.status === 'bailed-open') {
      lines.push(...formatBailedOpen(preview.platform, preview.reason));
    } else {
      lines.push(...formatDecided(preview.decision));
    }
  }

  lines.push('');
  lines.push('This is a preview: no build was created and nothing was uploaded.');

  return lines.join('\n');
}

/* ========================================================================== */

function formatDecided(decision: DryRunPlatformDecision): string[] {
  const label = PLATFORM_LABEL[decision.platform];
  const emoji = decision.platform === 'android' ? '🤖' : '🍎';

  // isFullCapture = "a real run would capture EVERYTHING for this platform".
  // capturedStoryFilePaths is empty here and must NEVER be rendered as an empty
  // list / "captures nothing" - that inversion is the single worst misread.
  if (decision.isFullCapture) {
    return [`${emoji} ${label} - would capture EVERY story`, `   Reason: ${decision.reason}`];
  }

  const captured = decision.capturedStoryFilePaths.length;
  const count =
    decision.totalStories !== undefined
      ? `${captured} of ${decision.totalStories} stories`
      : `${captured} ${captured === 1 ? 'story' : 'stories'}`;

  const lines = [`${emoji} ${label} - would capture ${count}`];

  if (captured > 0) {
    lines.push('   Story files:');
    for (const filePath of decision.capturedStoryFilePaths) {
      lines.push(`     • ${filePath}`);
    }
  } else {
    // A PARTIAL capture that reaches no story genuinely captures nothing (this is
    // NOT the isFullCapture branch above).
    lines.push('   No module changes reach any story - a real run would capture nothing.');
  }

  // Reason is printed VERBATIM (path-legible server string).
  lines.push(`   Reason: ${decision.reason}`);

  return lines;
}

function formatBailedOpen(platform: Platform, reason: string): string[] {
  const label = PLATFORM_LABEL[platform];
  const emoji = platform === 'android' ? '🤖' : '🍎';
  return [
    `${emoji} ${label} - preview unavailable; a real run would capture EVERY story`,
    `   Reason: ${reason}`,
  ];
}
