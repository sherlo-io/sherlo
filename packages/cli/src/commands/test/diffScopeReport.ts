/**
 * The ONE capture-plan renderer, shared by BOTH the live staged run and its
 * --dry-run preview (SHERLO-1919; init's grammar since epic sherlo-test-builds-apps).
 *
 * The staged road photographs only the stories a change can affect and reuses the
 * previous build's photos for the rest. This module says that decision as one of
 * `sherlo init`'s step lines - `✔ Planned the capture   3 of 24 stories: <why>` -
 * with the captured stories named under it. It reads IDENTICALLY in both modes
 * except for the step's name: the live run "Planned the capture", the dry run
 * "Previewed the capture". The name is a parameter ({@link DiffScopeMode}), never
 * a second implementation - two formatters that can drift is the exact failure
 * this module exists to prevent.
 *
 * ONE LINE FOR THE TEST when every platform decided the same, so a two-platform
 * run reads as one plan; one line per platform, each naming its platform, when
 * they differ.
 *
 * THE INVERSION HAZARD (read twice): a FULL capture (`full: true`) means EVERY
 * story was in scope, EVEN THOUGH its captured-file list is empty. Empty-list on
 * a full capture is "everything", NOT "nothing". {@link describeDecision}
 * branches on `full` FIRST and never infers "nothing" from an empty list. The
 * ONLY decision that reads "nothing to capture" is a PARTIAL capture whose list
 * is empty (`full: false`, no paths).
 *
 * THE FRACTION IS MANIFEST-DENOMINATED: "N of M stories". M is the WHOLE
 * bundle's story set (the manifest story-closure count), NOT the `--include`
 * scope - the scope filter runs on-device against story titles, so the CLI cannot
 * honestly scope this count at bundle time. `--include` never moves M.
 *
 * Reasons are printed VERBATIM. This module never invents, rewords, or re-derives
 * a reason; the text is composed SERVER-side (1 file: "X changed" / 2-3:
 * "3 files changed - a, b, c" / more: "14 files changed") and printed straight
 * through. A reason it is not given is simply omitted, and a full capture with no
 * reason degrades to the "couldn't work out what changed" safety wording.
 *
 * The words are drafts for the content department.
 */
import { Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import { countStories, platformWithEmoji, renderTestStep } from '../../render/testSteps';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which run is printing. Selects the step's name - the one word that differs. */
export type DiffScopeMode = 'dry-run' | 'live';

/**
 * One platform's capture outcome, as the plan consumes it. Both callers map their
 * own data into this shape, so the rendering below is the single source of truth
 * for how a decision reads.
 */
export type DiffScopePlatformReport = {
  kind: 'decided';
  platform: Platform;
  /**
   * true = EVERY story was in scope (a full capture). The captured-file list is
   * empty in that case and MUST render as "N of N stories", never "nothing" (the
   * inversion hazard). false = the partial closure-diff below.
   */
  full: boolean;
  /**
   * Story SOURCE FILE paths that were captured. Empty on a full capture (means
   * "everything"); may also be empty on a partial capture that reaches no story
   * (means "nothing to capture"). Ignored when `full` is true.
   */
  capturedStoryFilePaths: string[];
  /**
   * M: the total number of stories in THIS bundle (the manifest's story-file
   * count). Absent when no manifest was produced - the fraction then degrades to
   * a bare count with no "of M".
   */
  totalStoriesInBundle?: number;
  /**
   * The server's reason, printed VERBATIM after the decision. Absent -> no reason
   * shown; a full capture with no reason gets the safety wording instead.
   */
  reason?: string;
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** The step's name per mode - the ONLY word that differs between the two modes. */
const STEP_NAME: Record<DiffScopeMode, string> = {
  live: 'Planned the capture',
  'dry-run': 'Previewed the capture',
};

/**
 * Render the whole plan: one step line for the test when every platform decided
 * the same, else one per platform, each with the captured stories under it. The
 * endings (live: the started test and its link; dry run: the dry-run line) are
 * printed by the CALLERS - this module owns the plan, not the run's outcome.
 */
export function formatDiffScopeReport(
  mode: DiffScopeMode,
  platforms: DiffScopePlatformReport[]
): string {
  const lines = platforms.map((block) => ({
    platform: block.platform,
    decision: describeDecision(block),
    stories: storiesUnder(block),
  }));

  const everyPlatformDecidedTheSame = lines.every(
    (line) =>
      line.decision === lines[0].decision && line.stories.join('\n') === lines[0].stories.join('\n')
  );

  if (lines.length > 0 && everyPlatformDecidedTheSame) {
    return [
      renderTestStep({ name: STEP_NAME[mode], detail: lines[0].decision }),
      ...lines[0].stories,
    ].join('\n');
  }

  return lines
    .flatMap(({ platform, decision, stories }) => [
      renderTestStep({
        name: STEP_NAME[mode],
        detail: `${platformWithEmoji(platform)} - ${decision}`,
      }),
      ...stories,
    ])
    .join('\n');
}

/**
 * ONE platform's decision, as the step's detail says it. The shared core both
 * modes read identically - it takes no mode, only the decision.
 */
export function describeDecision(block: DiffScopePlatformReport): string {
  const M = block.totalStoriesInBundle;

  // INVERSION GUARD: `full` is checked FIRST. A full capture is "N of N stories",
  // even with an empty captured-file list - never let the empty list read as
  // "nothing". Only the partial branch below can say "nothing to capture".
  if (block.full) {
    const allStories = M !== undefined ? `${M} of ${countStories(M)}` : 'all stories';
    // No reason for a full capture -> the honest degrade: we could not work out
    // what changed, so everything is captured to be safe.
    return `${allStories}: ${
      block.reason ?? "couldn't work out what changed, so all are captured to be safe"
    }`;
  }

  const captured = block.capturedStoryFilePaths.length;
  const reasonTail = block.reason ? `: ${block.reason}` : '';

  // PARTIAL zero: nothing your changes touch reaches a story. The step's name already says
  // "capture", so the server's reason stands alone.
  if (captured === 0) return block.reason ?? 'nothing to capture';

  // PARTIAL with captures. No manifest -> no honest denominator: a bare count.
  const fraction = M !== undefined ? `${captured} of ${countStories(M)}` : countStories(captured);
  return `${fraction}${reasonTail}`;
}

/** The captured stories, named under a partial capture's step line. */
function storiesUnder(block: DiffScopePlatformReport): string[] {
  if (block.full) return [];
  return block.capturedStoryFilePaths.map((filePath) =>
    chalk.dim(`   ${cleanStoryPath(filePath)}`)
  );
}

/**
 * Turn a story SOURCE FILE path into its display name: keep the last two path
 * segments (the story's group folder + its name) and drop the `.stories.<ext>`
 * suffix, so `src/components/Storefront/ProductCard.stories.tsx` reads
 * `Storefront/ProductCard`. This is pure path cleanup - NOT a story-title map.
 */
export function cleanStoryPath(filePath: string): string {
  const withoutSuffix = filePath.replace(/\.stories\.[jt]sx?$/, '');
  const segments = withoutSuffix.split('/').filter(Boolean);
  return segments.slice(-2).join('/');
}
