/**
 * The ONE "Capture plan" renderer, shared by BOTH the live staged run and
 * its --dry-run preview (SHERLO-1919, format replacing SHERLO-1915).
 *
 * The staged road photographs only the stories a change can affect and reuses the
 * previous build's photos for the rest. This module renders a per-platform
 * "Capture plan" block that reads IDENTICALLY in both modes except for the
 * capture VERB: the live run says "capturing", the dry run says "would capture".
 * The verb is a parameter ({@link CaptureTense}), never a second implementation -
 * two formatters that can drift is the exact failure this module exists to
 * prevent. Everything else - the "reusing N from the previous build" clause, the
 * "nothing to capture" line, the story list, the reason - is byte-identical
 * across the two modes.
 *
 * THE INVERSION HAZARD (read twice): a FULL capture (`full: true`) means EVERY
 * story was in scope, EVEN THOUGH its captured-file list is empty. Empty-list on
 * a full capture is "everything", NOT "nothing". {@link formatDiffScopeBlock}
 * branches on `full` FIRST and never infers "nothing" from an empty list. The
 * ONLY block that renders as "nothing to capture" is a PARTIAL capture whose list
 * is empty (`full: false`, no paths).
 *
 * THE FRACTION IS MANIFEST-DENOMINATED: "N of M stories". M is the WHOLE
 * bundle's story set (the manifest story-closure count), NOT the `--include`
 * scope - the scope filter runs on-device against story titles, so the CLI cannot
 * honestly scope this count at bundle time. `--include` never moves M.
 *
 * Reasons are printed VERBATIM. This module never invents, rewords, or re-derives
 * a reason; the "why:" text is composed SERVER-side (1 file: "X changed" / 2-3:
 * "3 files changed - a, b, c" / more: "14 files changed") and printed straight
 * through. A reason it is not given is simply omitted, and a full capture with no
 * reason degrades to the "couldn't compute" safety row.
 */
import { Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import { PLATFORM_LABEL } from '../../constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The tense the plan reads in. The decision is identical in both modes; only the
 * capture verb changes. `would-capture` = the dry-run preview ("would capture");
 * `capturing` = the live run ("capturing"). Note the "reusing N from the previous
 * build" clause stays PRESENT tense in BOTH modes - only the capture verb moves.
 */
export type CaptureTense = 'would-capture' | 'capturing';

/** Which run is printing. Selects the header suffix and the tense. */
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
   * empty in that case and MUST render as "all N stories", never "nothing" (the
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
   * a bare count with no "of M" and no reuse clause.
   */
  totalStoriesInBundle?: number;
  /**
   * The server's reason, printed VERBATIM after "why: " (partial) or inline after
   * "nothing to capture - " (partial-zero). Absent -> no reason shown; a full
   * capture with no reason falls to the "couldn't compute" safety row.
   */
  reason?: string;
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const HEADER: Record<DiffScopeMode, string> = {
  'dry-run': '📸 Capture plan (dry run)',
  live: '📸 Capture plan',
};

/** The capture verb per tense - the ONLY word that differs between the two modes. */
const CAPTURE_VERB: Record<CaptureTense, string> = {
  'would-capture': 'would capture',
  capturing: 'capturing',
};

// Indentation is significant (SHERLO-1919 spec): platform line = 2 spaces, the
// why:/stories:/status rows = 5 spaces, bullets = 7 spaces.
const ROW = '     '; // 5 spaces
const BULLET = '       •'; // 7 spaces + bullet
/**
 * The separator that divides a label from its claim (and a claim from its reason)
 * throughout the capture plan and its callers' closers. Exported so the closers
 * (dryRun.ts, testBundled.ts) read the same way as the formatter rather than each
 * spelling the character inline.
 */
export const SEPARATOR = '-';

/**
 * Render the whole "Capture plan": the header and one block per platform. The
 * closers (live: the Review URL; dry run: the "◦ Dry run" notice) are printed
 * by the CALLERS, not here - this module owns the plan, not the run's outcome
 * line.
 */
export function formatDiffScopeReport(
  mode: DiffScopeMode,
  platforms: DiffScopePlatformReport[]
): string {
  const tense: CaptureTense = mode === 'dry-run' ? 'would-capture' : 'capturing';

  const lines: string[] = [chalk.bold(HEADER[mode])];
  for (const platform of platforms) {
    lines.push(...formatDiffScopeBlock(platform, tense));
  }

  return lines.join('\n');
}

/**
 * Render ONE platform block in the given tense. This is the shared core both
 * modes read identically apart from the capture verb - it takes no header,
 * closer, or mode, only the decision and the tense.
 */
export function formatDiffScopeBlock(
  block: DiffScopePlatformReport,
  tense: CaptureTense
): string[] {
  const verb = CAPTURE_VERB[tense];
  const M = block.totalStoriesInBundle;
  const lines: string[] = [];

  // INVERSION GUARD: `full` is checked FIRST. A full capture is "all N stories",
  // even with an empty captured-file list - never let the empty list read as
  // "nothing". Only the partial branch below can render "nothing to capture".
  if (block.full) {
    // "all N story/stories in this bundle" agrees in number with M (M === 1 ->
    // "story") and names the fraction's universe so M cannot be misread as the
    // --include scope; with no manifest it degrades to a bare "all stories" (no M,
    // so nothing to name).
    const allStories =
      M !== undefined ? `all ${M} ${M === 1 ? 'story' : 'stories'} in this bundle` : 'all stories';
    lines.push(headingLine(block.platform, `${verb} ${allStories}`));
    if (block.reason) {
      lines.push(whyRow(block.reason));
    } else {
      // No reason for a full capture -> the honest degrade: we could not work out
      // what changed, so everything is re-shot to be safe.
      lines.push(
        chalk.yellow(
          `${ROW}! couldn't compute what changed ${SEPARATOR} capturing everything to be safe`
        )
      );
    }
    return lines;
  }

  const captured = block.capturedStoryFilePaths.length;

  // PARTIAL zero: nothing your changes touch reaches a story.
  if (captured === 0) {
    const tail = block.reason ? ` ${SEPARATOR} ${block.reason}` : '';
    lines.push(headingLine(block.platform, `nothing to capture${tail}`));
    if (M !== undefined) {
      const noun = M === 1 ? 'story' : 'stories';
      lines.push(
        chalk.green(`${ROW}✓`) + chalk.dim(` all ${M} ${noun} reused from the previous build`)
      );
    }
    return lines;
  }

  // PARTIAL with captures.
  if (M !== undefined) {
    const reused = M - captured;
    // "reusing 0 from the previous build" only states that nothing happened - drop
    // the clause entirely when nothing is reused and print just the fraction.
    const reuseClause = reused === 0 ? '' : `, reusing ${reused} from the previous build`;
    // "in this bundle" names the fraction's universe (M is the whole bundle's
    // story set, NOT the --include scope) and sits between the fraction and the
    // reuse clause: "N of M stories in this bundle, reusing K ...".
    lines.push(
      headingLine(
        block.platform,
        `${verb} ${captured} of ${M} stories in this bundle${reuseClause}`
      )
    );
  } else {
    // No manifest -> no honest denominator and no reuse count. Degrade to a bare
    // captured count; still list the captured stories and the reason below.
    lines.push(
      headingLine(block.platform, `${verb} ${captured} ${captured === 1 ? 'story' : 'stories'}`)
    );
  }

  if (block.reason) lines.push(whyRow(block.reason));

  lines.push(chalk.dim(`${ROW}stories:`));
  for (const filePath of block.capturedStoryFilePaths) {
    lines.push(chalk.dim(`${BULLET} ${cleanStoryPath(filePath)}`));
  }

  return lines;
}

/* ========================================================================== */
/* The one-line "Diff Scope:" summary (view-metadata, operator ruling         */
/* 2026-09-03) - printed once at build open, alongside the "Capture plan"     */
/* block above, for a plain sentence a developer reads in CI.                 */
/* ========================================================================== */

/**
 * One platform's data for the "Diff Scope:" summary line: the same decision
 * {@link DiffScopePlatformReport} already carries, plus the two things that
 * block does not need - the WHOLE bundle's story set (to name what was
 * inherited, not just what was captured) and the ancestor build this run's
 * decision diffed against.
 */
export type DiffScopeSummaryInput = {
  full: boolean;
  capturedStoryFilePaths: string[];
  totalStoriesInBundle?: number;
  reason?: string;
  /**
   * Every story SOURCE FILE path in this build's bundle (the manifest's whole
   * `storyClosures` key set), so the inherited names can be named rather than
   * just counted: inherited = allStoryFilePaths - capturedStoryFilePaths.
   * Absent -> no manifest, so the summary line is not printed at all (see
   * {@link formatDiffScopeSummaryLine}).
   */
  allStoryFilePaths?: string[];
  /**
   * The primary frozen ancestor build index this run's decision diffed
   * against (sherlo-api `Build.diffScopeInfo.ancestorBuildIndex`, commit
   * e7c7d5a on `feature/sherlo-3`), or `undefined` when the server sent none -
   * an older API, or a build with no ancestor at all (first build).
   */
  ancestorBuildIndex?: number;
};

/**
 * The plain, one-line summary a developer reads in CI: what Diff Scope did
 * and why, in one sentence, distinct from the multi-line "Capture plan" block
 * above (which stays the detailed per-platform breakdown; this line is the
 * short version at build open).
 *
 *   Full capture:    `Diff Scope: capturing all M stories: <reason>`
 *   Partial capture: `Diff Scope: <reason> - capturing N of M stories: <names>;
 *                      inheriting K from build #A: <names>`
 *
 * Returns undefined when there is nothing honest to say: no manifest (no `M`,
 * so no fraction and no name list) degrades to silence rather than a line with
 * blanks in it - the multi-line block above already covers that case with its
 * own bare-count degrade.
 */
export function formatDiffScopeSummaryLine(input: DiffScopeSummaryInput): string | undefined {
  const {
    full,
    capturedStoryFilePaths,
    totalStoriesInBundle: M,
    reason,
    allStoryFilePaths,
  } = input;

  if (M === undefined || allStoryFilePaths === undefined) return undefined;

  if (full) {
    const noun = M === 1 ? 'story' : 'stories';
    const tail = reason ? `: ${reason}` : '';
    return `Diff Scope: capturing all ${M} ${noun}${tail}`;
  }

  const capturedNames = capturedStoryFilePaths.map(cleanStoryPath);
  const capturedSet = new Set(capturedStoryFilePaths);
  const inheritedNames = allStoryFilePaths
    .filter((path) => !capturedSet.has(path))
    .map(cleanStoryPath);

  const prefix = reason ? `${reason} - ` : '';
  const captureClause = `capturing ${capturedStoryFilePaths.length} of ${M} stories: ${
    capturedNames.length > 0 ? capturedNames.join(', ') : 'none'
  }`;

  const inheritClause =
    inheritedNames.length > 0 && input.ancestorBuildIndex !== undefined
      ? `; inheriting ${inheritedNames.length} from build #${
          input.ancestorBuildIndex
        }: ${inheritedNames.join(', ')}`
      : '';

  return `Diff Scope: ${prefix}${captureClause}${inheritClause}`;
}

function platformEmoji(platform: Platform): string {
  return platform === 'android' ? '🤖' : '🍎';
}

/** The 2-space platform line: cyan heading, separator, bold claim. */
function headingLine(platform: Platform, claim: string): string {
  const heading = chalk.cyan(`${platformEmoji(platform)} ${PLATFORM_LABEL[platform]}`);
  return `  ${heading} ${SEPARATOR} ${chalk.bold(claim)}`;
}

/** The 5-space "why:" row - the server's reason, printed VERBATIM. */
function whyRow(reason: string): string {
  return chalk.dim(`${ROW}why: ${reason}`);
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
