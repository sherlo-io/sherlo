/**
 * The `--dry-run` capture plan and its closer - pure, moved here from
 * ../commands/test/dryRun.ts when the render layer was extracted (slice S0a).
 *
 * The same `formatDiffScopeReport` renders the plan for BOTH the live run and the
 * preview, and the only thing this module adds is the dry run's own closer. The
 * move is what makes dryRun.ts free of literals.
 */
import { Platform } from '@sherlo/api-types';
import type { DryRunPlatformDecision } from '../commands/test/dryRunDecision';
import {
  formatDiffScopeReport,
  type DiffScopePlatformReport,
} from '../commands/test/diffScopeReport';

/**
 * One platform's preview outcome: either a decision from the server (which may
 * itself be a confident full capture), or a CLI bail-open (we could not get a
 * trustworthy answer at all, so a real run would capture everything).
 */
export type DryRunPlatformPreview =
  | { status: 'decided'; decision: DryRunPlatformDecision }
  | { status: 'bailed-open'; platform: Platform; reason: string };

/**
 * The dry-run closer, printed after the plan instead of the live run's started
 * test and its link. A dry run creates nothing, so it says exactly that.
 */
const DRY_RUN_CLOSER = 'This was a dry run: nothing was uploaded and no test was started.';

/**
 * Render the whole dry-run preview by mapping each platform's preview onto the
 * shared {@link formatDiffScopeReport}, then appending the dry-run closer. The
 * dry run and the live run print the SAME plan; only the step's name
 * ("Previewed the capture") differs, and it lives in that one shared module.
 *
 * A bail-open (the decision query gave no trustworthy answer for a platform)
 * maps onto a FULL capture with no reason - the shared formatter renders that as
 * "all stories" with the "couldn't work out what changed" safety wording, the
 * same honest degrade the live run shows. The raw error stays in telemetry, not
 * on the user's line.
 */
export function formatDryRunPreview(previews: DryRunPlatformPreview[]): string {
  const platforms: DiffScopePlatformReport[] = previews.map((preview) =>
    preview.status === 'bailed-open'
      ? {
          kind: 'decided',
          platform: preview.platform,
          full: true,
          capturedStoryFilePaths: [],
        }
      : decisionToReport(preview.decision)
  );

  return `${formatDiffScopeReport('dry-run', platforms)}\n\n${DRY_RUN_CLOSER}`;
}

/* ========================================================================== */

/** Map a server decision onto the shared per-platform report shape. */
function decisionToReport(decision: DryRunPlatformDecision): DiffScopePlatformReport {
  return {
    kind: 'decided',
    platform: decision.platform,
    full: decision.isFullCapture,
    capturedStoryFilePaths: decision.capturedStoryFilePaths,
    totalStoriesInBundle: decision.totalStories,
    reason: decision.reason,
  };
}
