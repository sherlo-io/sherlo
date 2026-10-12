/**
 * THE BUILD-VIEW LINES (F5) - what `sherlo view` prints about one build, and its
 * `--json` record, the one read-back of everything about a test.
 *
 * Pure, like the rest of `src/render/`: state in, bytes out. The command decides
 * WHICH of these happen and in what order; this decides what each one looks
 * like.
 */
import chalk from 'chalk';
import type { BuildStatusAnswer } from '../seams/serverCalls';
import {
  storyStatusWord,
  renderVerdictNoChanges,
  renderVerdictPassed,
  renderVerdictReviewRequired,
} from './verdictCloser';

/* ========================================================================== */
/* `sherlo view`'s own lines                                                  */
/* ========================================================================== */

/**
 * The run status in plain words - never the wire's own (`inProgress`). An unmapped status falls
 * through to the raw wire value rather than to a blank: a status this table has not learned yet is
 * information, not nothing.
 */
const RUN_STATUS_WORD: Record<string, string> = {
  queued: 'queued',
  waiting: 'waiting',
  inProgress: 'running',
  finished: 'finished',
  error: 'failed',
  canceled: 'canceled',
};

/**
 * `Test 7 · running` - the first line `sherlo view` prints.
 *
 * It names the test and its run status and NOTHING ELSE. A branch and a commit
 * belong on this line, but `getBuildStatus` does not carry the build's git info
 * and this checkout's git describes a different commit, so printing either
 * would be a guess dressed as a fact.
 */
export function renderBuildViewHeader(buildIndex: number, runStatus: string): string {
  return `${chalk.green(`Test ${buildIndex}`)} · ${RUN_STATUS_WORD[runStatus] ?? runStatus}`;
}

/** `0 approved · 0 reported · 3 unreviewed · 41 no changes` - the four review counts, in one dim line. */
export function renderBuildViewTally(counts: ReviewCounts): string {
  return chalk.dim(
    `${counts.approved} approved · ${counts.reported} reported · ` +
      `${counts.unreviewed} unreviewed · ${counts.noChanges} no changes`
  );
}

type ReviewCounts = { approved: number; noChanges: number; reported: number; unreviewed: number };

/**
 * The verdict, as the section `--wait` ends with (./verdictCloser): `⚠️ 3 stories need review`,
 * `✅ No visual changes`, `✅ All stories passed` once every change was approved.
 *
 * THE REVIEW STATUS IS ONLY READ FOR A FINISHED TEST. The server computes `status` off the review
 * counts whatever the run is doing, so a test still capturing answers `unreviewed` - and a verdict
 * over a run that has not finished would be plainly false. A running test ends on the `👉 Next step`
 * section instead (../commands/view/printBuildView); a test that failed says so in its header, and
 * nothing more here.
 *
 * NO LINES when the wire gave the CLI nothing to say: the test finished but the API sent no review
 * status (an older API). Saying nothing is the honest rendering of that.
 */
export function renderBuildViewStatus({
  runStatus,
  status,
  counts,
}: {
  runStatus: string;
  status?: 'approved' | 'noChanges' | 'reported' | 'unreviewed';
  counts?: ReviewCounts;
}): string[] {
  if (runStatus !== 'finished') return [];

  if (status === 'noChanges') return renderVerdictNoChanges();
  if (status === 'approved') return renderVerdictPassed();
  if ((status === 'unreviewed' || status === 'reported') && counts) {
    return renderVerdictReviewRequired(undefined, counts);
  }
  return [];
}

/* ========================================================================== */
/* The old `── details ──` block's facts (`--metadata`, gone from `sherlo test`) */
/* ========================================================================== */

/*
 * PLAN-LAYER DEBT, NAMED (epic sherlo-test-builds-apps, operator ruling 2026-10-12 Q4): `--metadata`
 * left `sherlo test`, so nothing prints the details block any more and its renderer is gone. These
 * two types stay only because helpers/buildDetails and the wait loop's `metadata` parameter, outside
 * what plan may edit, still build the block's facts; the build task deletes all three.
 */

/** The build's git identity, as the run that CREATED the build composed and sent it at openBuild. */
export type BuildDetailsGitFacts = {
  branchName: string;
  commitHash: string;
  /** Whether the working tree had uncommitted changes. Absent -> not captured. */
  isDirty?: boolean;
  /** The repository's default branch, as the run resolved it from the remote. */
  defaultBranch?: string;
};

/**
 * Everything the details block can say about a build.
 *
 * Structurally a subset of the `getBuildStatus` wire shape plus the git facts
 * above, so the mapper that fills it (helpers/buildDetails) is a field lift and
 * not a translation - and so the render layer does not have to import from the
 * poll loop, which would be a cycle.
 */
export type BuildDetails = {
  git?: BuildDetailsGitFacts;
  runStatus: string;
  runError?: unknown;
  showsOnlyBranchChanges?: boolean;
  viewStatusesCount?: {
    approved: number;
    noChanges: number;
    reported: number;
    unreviewed: number;
  };
  diffScopeInfo?: {
    capturedSnapshotCount?: number;
    inheritedSnapshotCount?: number;
  };
  /**
   * The Diff Scope block (view-metadata, operator ruling 2026-09-03) - the
   * same shape `sherlo view --json` prints as `diffScope`, reused here so
   * `sherlo test --wait --metadata` says the same thing about the same build.
   * Absent on an older API (no `diffScope` field) or a gate-off build.
   */
  diffScope?: {
    reason: string;
    captured: string[];
    inherited: string[];
    ancestorBuildIndex: number | null;
  };
};

/* ========================================================================== */
/* `sherlo view --json`: the record (operator decision 2026-10-12)            */
/* ========================================================================== */

/**
 * One row of `stories[]`, exactly as `getBuildStatus` sends it and exactly as
 * the JSON prints it - a field lift, like {@link BuildDetails} above, never a
 * translation. `status` stays a plain string (not a narrowed union) for the
 * same reason it does on the wire type in helpers/waitForBuildResult: a status
 * this CLI has not learned yet must still pass through.
 */
export type ViewStory = {
  name: string;
  status: string;
  baseline: { buildIndex: number } | null;
  /** `null` is a row the wire sent with nothing to say - distinct from absent (an older API). */
  reason?: string | null;
  /** `null` is a row the wire sent with nothing to say - distinct from absent (an older API). */
  candidates?: { buildIndex: number }[] | null;
};

/**
 * THE WHOLE `sherlo view <n> --json` RECORD - one read-back for everything about a test (operator
 * decision 2026-10-12, epic sherlo-test-builds-apps). Every key is one the JSON prints under its own
 * name, in this order, and agents read them, so a name never changes once shipped.
 *
 * A FIELD LIFT OFF `getBuildStatus` (commands/view/printBuildView's `viewJsonOf`), never a
 * translation: absent means the service did not say (an older API), `null` means it said "none",
 * and nothing is ever filled in as a zero.
 */
export type ViewJson = {
  runStatus: string;
  buildIndex: number;
  /** The build's frozen git identity. `dirty`: the push sent uncommitted changes. */
  commit?: { sha: string; branch: string; dirty?: boolean | null };
  /** `true`: the build shows only what its own branch changed against the main line. */
  showsOnlyBranchChanges?: boolean;
  /** The main line the build was judged against. `null` while the project has none. */
  mainBranch?: string | null;
  /** The CI run that pushed the build. `null` for a push from a person's machine. */
  ciRun?: { provider: string; runId: string } | null;
  /** Why the run ended in `error`: the service's code, and the platform when it was one platform's. */
  runError?: { code: string; platform?: 'android' | 'ios' };
  /** The devices the run was asked for. */
  devices?: BuildStatusAnswer['devices'];
  viewStatusesCount?: ViewMetadataJson['viewStatusesCount'];
  /** `null` is what the wire sends for a build whose run errored before any view row existed. */
  stories?: ViewStory[] | null;
  /** The Diff Scope block, build-wide, as today: see {@link ViewMetadataJson}'s `diffScope`. */
  diffScope?: ViewMetadataJson['diffScope'];
  /**
   * Per platform the run was asked for: whether its app build `arrived`, where the app build came
   * from (`appBuild`), the capture plan (`capture`, read off the stored decision, so a canceled
   * build still has it) and `storiesInBundle`. See ../seams/serverCalls' BuildStatusPlatform.
   */
  platforms?: BuildStatusAnswer['platforms'];
};

/**
 * `sherlo view --json`'s entire output: the record, pretty-printed, and nothing
 * else - no header, no colour, no url line. It is meant to be piped and parsed,
 * so the bytes are exactly `JSON.stringify(json, null, 2)`.
 */
export function renderViewJson(json: ViewJson): string {
  return JSON.stringify(json, null, 2);
}

/**
 * The record `--metadata` printed before it became `--json`.
 *
 * PLAN-LAYER DEBT, NAMED (epic sherlo-test-builds-apps): nothing prints it any more; only
 * helpers/buildDetails' `buildViewMetadataJson` still builds it, and the build task deletes both.
 */
export type ViewMetadataJson = {
  runStatus: string;
  buildIndex: number;
  /**
   * The build's frozen git identity. Unlike the old `── details ──` block (see
   * {@link BuildDetailsGitFacts}'s doc), this DOES come from the wire now -
   * `getBuildStatus` carries it - so it is present whenever the API sent
   * `gitInfo`, for `sherlo view` exactly as for `sherlo test`.
   */
  commit?: { sha: string; branch: string };
  viewStatusesCount?: {
    approved: number;
    noChanges: number;
    reported: number;
    unreviewed: number;
  };
  /** `null` is what the wire sends for a build whose run errored before any view row existed. */
  stories?: ViewStory[] | null;
  /**
   * The Diff Scope block (view-metadata, operator ruling 2026-09-03): what
   * `sherlo view --json` prints as `diffScope`. `reason` is the primary
   * platform's prose, `captured`/`inherited` are story display names, and
   * `ancestorBuildIndex` is the build this decision diffed against (`null`
   * when there was none). Absent whenever the API sent no `diffScope` (an
   * older API, or a gate-off build).
   */
  diffScope?: {
    reason: string;
    captured: string[];
    inherited: string[];
    ancestorBuildIndex: number | null;
  };
};

/* ========================================================================== */
/* The stories table (human-readable, no `--json`)                           */
/* ========================================================================== */

/**
 * The per-story table `sherlo view` prints (without `--json`) under the
 * check sentence. Plain and aligned: three columns, one row per story, widths
 * driven by the widest cell actually present.
 *
 * The status column says each story's status in plain words (`needs review`,
 * `no changes`), never the wire's own (./verdictCloser's storyStatusWord).
 *
 * A `review-required` row's baseline column carries the reason instead of a
 * test number - there IS no baseline for that story (see
 * ViewStory.baseline), and printing blank there would read as an
 * omission rather than the answer.
 */
export function renderStoriesTable(stories: ViewStory[]): string[] {
  if (stories.length === 0) return [];

  const rows = stories.map((story) => ({
    name: story.name,
    status: storyStatusWord(story.status),
    baseline: baselineCell(story),
  }));

  const nameWidth = Math.max(...rows.map((row) => row.name.length)) + 2;
  const statusWidth = Math.max(...rows.map((row) => row.status.length)) + 2;

  return [
    'STORY'.padEnd(nameWidth) + 'STATUS'.padEnd(statusWidth) + 'BASELINE',
    ...rows.map(
      (row) => row.name.padEnd(nameWidth) + row.status.padEnd(statusWidth) + row.baseline
    ),
  ];
}

function baselineCell(story: ViewStory): string {
  if (story.baseline) return `Test ${story.baseline.buildIndex}`;
  if (story.reason === 'two-baselines' && story.candidates) {
    return `two baselines (${story.candidates.map((c) => `Test ${c.buildIndex}`).join(', ')})`;
  }
  return '-';
}
