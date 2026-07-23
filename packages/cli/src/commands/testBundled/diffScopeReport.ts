/**
 * The ONE Diff Scope report renderer, shared by BOTH the live test:bundled run
 * and its --dry-run preview (SHERLO-1915).
 *
 * A Diff Scope decision photographs only the stories a change can affect and
 * reuses the base build's photos for the rest. Before this module, the live run
 * printed NOTHING about that decision and the dry run had its own formatter, so a
 * developer learned the outcome only from the dashboard. This module renders a
 * per-platform block that reads IDENTICALLY in both modes except for TENSE: the
 * dry run says "would capture", the live run says "captured". Tense is a
 * parameter ({@link CaptureTense}), never a second implementation - two
 * formatters that can drift is the exact failure this module exists to prevent.
 *
 * THE INVERSION HAZARD (read twice): a FULL capture (`full: true`) means EVERY
 * story was in scope, EVEN THOUGH its captured-file list is empty. Empty-list on
 * a full capture is "everything", NOT "nothing". {@link formatDiffScopeBlock}
 * branches on `full` FIRST and never infers "nothing" from an empty list. The
 * ONLY block that renders as "nothing captured" is a PARTIAL capture whose list
 * is empty (`full: false`, no paths).
 *
 * THE FRACTION NAMES ITS UNIVERSE (tier-1 relabel): "N of M stories in this
 * bundle". M is the WHOLE bundle's story set, NOT the `--include` scope. The
 * scope filter runs on-device against story titles; the CLI cannot honestly
 * scope this count at bundle time, so the wording says "in this bundle" to stop
 * a developer running `--include ...` from reading M as their scope.
 *
 * Server reasons are printed VERBATIM. This module never invents, rewords, or
 * re-derives a reason; a reason it is not given is simply omitted.
 */
import { Platform } from '@sherlo/api-types';
import { PLATFORM_LABEL } from '../../constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The tense the report reads in. The decision is identical in both modes; only
 * the verbs change. `would-capture` = the dry-run preview ("would capture");
 * `captured` = the live run ("captured").
 */
export type CaptureTense = 'would-capture' | 'captured';

/** Which run is printing. Selects the header/footer and the tense. */
export type DiffScopeMode = 'dry-run' | 'live';

/**
 * One platform's Diff Scope outcome, as the report consumes it. Both callers map
 * their own data into this shape, so the rendering below is the single source of
 * truth for how a decision reads.
 */
export type DiffScopePlatformReport =
  | {
      kind: 'decided';
      platform: Platform;
      /**
       * true = EVERY story was in scope (a full capture). The captured-file list
       * is empty in that case and MUST render as "every story", never "nothing"
       * (the inversion hazard). false = the partial closure-diff below.
       */
      full: boolean;
      /**
       * Story SOURCE FILE paths that were captured. Empty on a full capture
       * (means "everything"); may also be empty on a partial capture that reaches
       * no story (means "nothing"). Ignored when `full` is true.
       */
      capturedStoryFilePaths: string[];
      /**
       * M: the total number of stories in THIS bundle (the manifest's story-file
       * count). Absent when no manifest was produced - the fraction then degrades
       * to a bare count with no "of M" and no reuse line.
       */
      totalStoriesInBundle?: number;
      /**
       * The server's reason, printed VERBATIM. Absent -> no reason line (the live
       * reason ladder can land here; the dry run always carries one).
       */
      reason?: string;
    }
  | {
      // Dry-run only: the decision query could not give a trustworthy answer, so
      // the safe preview is "a real run would capture everything".
      kind: 'bailed-open';
      platform: Platform;
      reason: string;
    };

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** The most story-file paths a block lists before it summarises the remainder. */
const MAX_LISTED_STORIES = 20;

const HEADER: Record<DiffScopeMode, string> = {
  'dry-run': '📋 Diff Scope preview - dry run (no build created)',
  live: '📋 Diff Scope - what this run photographed',
};

/**
 * One line, printed once under the header, that introduces the idea before the
 * per-platform blocks assume it. Someone who has never heard of Diff Scope can
 * read this and know what will and will not be photographed.
 */
const EXPLAINER =
  "Diff Scope photographs only the stories your changes can affect; the rest reuse the base build's photos.";

/**
 * Render the whole report: header, explainer, one block per platform, and (dry
 * run only) a footer stating nothing was created. Returned as a plain string the
 * caller prints as-is and tests assert on directly.
 */
export function formatDiffScopeReport(
  mode: DiffScopeMode,
  platforms: DiffScopePlatformReport[]
): string {
  const tense: CaptureTense = mode === 'dry-run' ? 'would-capture' : 'captured';

  const lines: string[] = [HEADER[mode], EXPLAINER];

  for (const platform of platforms) {
    lines.push('');
    lines.push(
      ...(platform.kind === 'bailed-open'
        ? formatBailedOpenBlock(platform.platform, platform.reason)
        : formatDiffScopeBlock(platform, tense))
    );
  }

  if (mode === 'dry-run') {
    lines.push('');
    lines.push('This is a preview: no build was created and nothing was uploaded.');
  }

  return lines.join('\n');
}

/**
 * Render ONE decided platform block in the given tense. This is the shared core
 * both modes read identically apart from tense - it takes no header, footer, or
 * mode, only the decision and the tense.
 */
export function formatDiffScopeBlock(
  block: Extract<DiffScopePlatformReport, { kind: 'decided' }>,
  tense: CaptureTense
): string[] {
  const heading = `${platformEmoji(block.platform)} ${PLATFORM_LABEL[block.platform]}`;
  const verb = VERBS[tense];
  const lines: string[] = [];

  // INVERSION GUARD: `full` is checked FIRST. A full capture is "every story",
  // even with an empty captured-file list - never let the empty list read as
  // "nothing". Only the partial branch below can render "nothing captured".
  if (block.full) {
    lines.push(`${heading} - ${verb.capture} EVERY story in this bundle`);
    pushReason(lines, block.reason);
    return lines;
  }

  const captured = block.capturedStoryFilePaths.length;
  const total = block.totalStoriesInBundle;

  if (total === undefined) {
    // No manifest -> no denominator and no honest reuse count. Degrade to a bare
    // captured count; still list the captured stories and the reason below.
    lines.push(`${heading} - ${verb.capture} ${captured} ${captured === 1 ? 'story' : 'stories'}`);
  } else {
    // The fraction names its universe ("in this bundle") so M is never misread as
    // the --include scope.
    lines.push(`${heading} - ${verb.capture} ${captured} of ${total} stories in this bundle`);
    const reused = total - captured;
    if (captured === 0) {
      lines.push(
        `   Nothing your changes touch reaches a story, so all ${total} ${verb.reusedAll} from the base build.`
      );
    } else if (reused > 0) {
      lines.push(
        `   ${verb.reuseOther} the other ${reused} (already photographed on the base build, not re-shot here).`
      );
    }
  }

  if (captured > 0) {
    lines.push(`   ${verb.listLabel}`);
    for (const line of listStoryFiles(block.capturedStoryFilePaths)) {
      lines.push(line);
    }
  }

  pushReason(lines, block.reason);
  return lines;
}

/* ========================================================================== */

/**
 * Verb forms per tense. This is the ONLY place the two modes diverge - every
 * other character a block prints is identical.
 */
const VERBS: Record<
  CaptureTense,
  {
    capture: string;
    reuseOther: string;
    reusedAll: string;
    listLabel: string;
  }
> = {
  'would-capture': {
    capture: 'would capture',
    reuseOther: 'Would reuse',
    reusedAll: 'would be reused',
    listLabel: 'Stories to capture:',
  },
  captured: {
    capture: 'captured',
    reuseOther: 'Reused',
    reusedAll: 'were reused',
    listLabel: 'Stories captured:',
  },
};

function platformEmoji(platform: Platform): string {
  return platform === 'android' ? '🤖' : '🍎';
}

function pushReason(lines: string[], reason: string | undefined): void {
  // Printed VERBATIM; absent -> no reason line at all.
  if (reason) lines.push(`   Reason: ${reason}`);
}

/** The bounded bullet list of captured story files, with an overflow summary. */
function listStoryFiles(paths: string[]): string[] {
  const shown = paths.slice(0, MAX_LISTED_STORIES).map((p) => `     • ${p}`);
  const hidden = paths.length - shown.length;
  if (hidden > 0) shown.push(`     • ... and ${hidden} more`);
  return shown;
}

/**
 * Dry-run only: the preview could not get a trustworthy answer for this
 * platform, so it states the safe outcome - a real run would capture everything.
 * Always future tense; a live run never bails open.
 */
function formatBailedOpenBlock(platform: Platform, reason: string): string[] {
  const heading = `${platformEmoji(platform)} ${PLATFORM_LABEL[platform]}`;
  return [
    `${heading} - preview unavailable; a real run would capture EVERY story`,
    `   Reason: ${reason}`,
  ];
}
