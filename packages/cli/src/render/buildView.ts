/**
 * THE BUILD-VIEW LINES (F5) - what `sherlo view` prints about one build, and the
 * `── details ──` block that BOTH `sherlo view` and `sherlo test --wait` print
 * for `--metadata`.
 *
 * Pure, like the rest of `src/render/`: state in, bytes out. The command decides
 * WHICH of these happen and in what order; this decides what each one looks
 * like.
 *
 * ------------------------------------------------------------------------
 * THE DETAILS BLOCK IS PLAIN, ALIGNED AND COLOURLESS, AND THAT IS A CONTRACT.
 *
 * It is read by machines as well as people - a kept-output fixture compares it
 * byte for byte with the run-specific values masked - so it carries no colour,
 * no spinner, no timestamp and no wall-clock read of any kind. Its ordering is
 * fixed by {@link detailRows} rather than by whatever order the wire happened to
 * answer in.
 *
 * The one moving part is the label column, which is padded to the widest label
 * PRESENT. That is deliberate and it is why the block stays stable under
 * masking: the column width is a function of the LABELS, and a masker only ever
 * rewrites values. A build whose facts are a subset of another's aligns
 * differently, and both alignments are reproducible from their own fact sets.
 *
 * ------------------------------------------------------------------------
 * WHAT IS NOT HERE, AND WHY IT IS NOT A TODO.
 *
 * The block prints a row only for a fact the CLI actually holds. Several facts
 * a reader might expect are absent because the ONE build read a project token
 * can make - `getBuildStatus` - does not return them: the build's git identity
 * (so `sherlo view` prints no `branch` row at all), the project's main-line
 * PROVENANCE (explicit vs inferred), per-screen baseline provenance, and whether
 * ancestry was unavailable. An absent row means "the CLI was not told", never
 * "the answer was nothing" - which is why nothing here zero-fills.
 */
import chalk from 'chalk';

/* ========================================================================== */
/* `sherlo view`'s own lines                                                  */
/* ========================================================================== */

/**
 * `Build #7 · finished` - the first line `sherlo view` prints.
 *
 * It names the build and its run status and NOTHING ELSE. A branch and a commit
 * belong on this line, but `getBuildStatus` does not carry the build's git info
 * and this checkout's git describes a different commit, so printing either
 * would be a guess dressed as a fact.
 */
export function renderBuildViewHeader(buildIndex: number, runStatus: string): string {
  return `${chalk.green(`Build #${buildIndex}`)} · ${runStatus}`;
}

/** The four review counts, in one dim line, in the wire's own vocabulary. */
export function renderBuildViewTally(counts: {
  approved: number;
  noChanges: number;
  reported: number;
  unreviewed: number;
}): string {
  return chalk.dim(
    `approved ${counts.approved} · reported ${counts.reported} · ` +
      `unreviewed ${counts.unreviewed} · noChanges ${counts.noChanges}`
  );
}

/**
 * The state a build is in, as the GitHub check names it. Not a wire field - the
 * wire sends a run status and (for a finished build) a review status, and this
 * is the single word those two collapse to.
 */
type CheckState = 'approved' | 'errored' | 'noChanges' | 'reported' | 'running' | 'unreviewed';

/**
 * The check's own sentence for each state - `<title> - <summary>`, with the
 * summary's first letter lowered so the two halves read as one line.
 *
 * THE WORDING IS THE CHECK'S, DELIBERATELY, and this is the same operator ruling
 * that put `No visual changes - all snapshots match their baselines.` into
 * {@link renderVerdictNoChanges}: the CLI and the GitHub check are answering the
 * same question about the same build, so they say the same words rather than two
 * phrasings of one verdict. Each entry below is `describeCheckState`'s title and
 * summary for that state, joined.
 */
const CHECK_SENTENCE: Record<CheckState, string> = {
  approved: 'Visual changes approved - all changed snapshots were approved in Sherlo.',
  errored: 'Visual tests errored - the Sherlo build did not finish. Re-run to try again.',
  noChanges: 'No visual changes - all snapshots match their baselines.',
  reported: 'Visual changes reported - a snapshot was reported (rejected) in Sherlo.',
  running: 'Running visual tests - Sherlo is capturing and comparing snapshots for this commit.',
  unreviewed: 'Visual changes need review - snapshots changed and are awaiting review in Sherlo.',
};

/** The icon each state wears, and the colour the whole sentence is printed in. */
const CHECK_STYLE: Record<
  CheckState,
  { icon: string; color: 'green' | 'red' | 'yellow' | 'blue' }
> = {
  approved: { icon: '✅', color: 'green' },
  errored: { icon: '❌', color: 'red' },
  noChanges: { icon: '✅', color: 'green' },
  reported: { icon: '⚠️ ', color: 'yellow' },
  running: { icon: '🔵', color: 'blue' },
  unreviewed: { icon: '⚠️ ', color: 'yellow' },
};

/**
 * Which state a build is in, from the two fields the wire sends.
 *
 * THE REVIEW STATUS IS ONLY READ FOR A FINISHED BUILD. The server computes
 * `status` off the review counts whatever the run is doing, so a build that is
 * still capturing answers `unreviewed` - and printing `Visual changes need
 * review` over a run that has not finished would be plainly false. A build that
 * ended in `error` or `canceled` is `errored`; anything else unfinished is
 * `running`.
 *
 * `undefined` means the CLI has no sentence to print: the build finished but the
 * API sent no review status, which is what an older API answers. Saying nothing
 * is the honest rendering of that.
 */
function checkStateOf(
  runStatus: string,
  status: 'approved' | 'noChanges' | 'reported' | 'unreviewed' | undefined
): CheckState | undefined {
  if (runStatus === 'error' || runStatus === 'canceled') return 'errored';
  if (runStatus !== 'finished') return 'running';
  return status;
}

/**
 * The check-style status sentence, or NO line at all when the wire gave the CLI
 * nothing to say - see {@link checkStateOf}.
 */
export function renderBuildViewStatus(
  runStatus: string,
  status: 'approved' | 'noChanges' | 'reported' | 'unreviewed' | undefined
): string[] {
  const state = checkStateOf(runStatus, status);
  if (!state) return [];

  const { icon, color } = CHECK_STYLE[state];
  return [chalk[color](`${icon} ${CHECK_SENTENCE[state]}`)];
}

/* ========================================================================== */
/* The `── details ──` block (`--metadata`)                                   */
/* ========================================================================== */

/**
 * The build's git identity, as the run that CREATED the build composed and sent
 * it at openBuild.
 *
 * It arrives as a parameter rather than being read here for the usual reason -
 * this layer reads nothing - but also for a product one: only a command that
 * opened the build itself can honestly claim these. `sherlo view` is looking at
 * a build this checkout may have nothing to do with, so it hands over no git and
 * the rows below simply do not appear.
 */
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
};

/** One `label: value` line of the block. */
type DetailRow = { label: string; value: string };

/** The block's heading, exactly as the fixtures carry it. */
const DETAILS_HEADING = '── details ──';

/**
 * The whole block: the heading, then one aligned line per fact the CLI holds.
 *
 * An empty list when there is nothing but the heading would be - which cannot
 * happen today, since the run status is always known - so the caller never has
 * to guard against a lone heading.
 */
export function renderBuildDetails(details: BuildDetails): string[] {
  const rows = detailRows(details);
  if (rows.length === 0) return [];

  // The colon and one space, so the widest label still gets a separator.
  const labelWidth = Math.max(...rows.map((row) => row.label.length)) + 2;

  return [
    DETAILS_HEADING,
    ...rows.map((row) => `${`${row.label}:`.padEnd(labelWidth)}${row.value}`),
  ];
}

/**
 * The facts, in the ONE order they are ever printed in: what was built, where it
 * sits relative to the project's main line, what the runner did, how much of the
 * suite the build accounted for, and how much of it a human has ruled on.
 */
function detailRows(details: BuildDetails): DetailRow[] {
  const rows: DetailRow[] = [];
  const { git, viewStatusesCount, diffScopeInfo } = details;

  if (git) {
    rows.push({ label: 'branch', value: branchValue(git) });
    if (git.defaultBranch) {
      // The NAME only. Whether the project's main line is an explicit setting or
      // one Sherlo inferred lives on the project, which a project token cannot
      // read - so the provenance the block would otherwise carry is omitted
      // rather than assumed from the fact that git answered.
      rows.push({ label: 'main line', value: git.defaultBranch });
    }
  }

  const scope = scopeValue(details.showsOnlyBranchChanges);
  if (scope) rows.push({ label: 'scope', value: scope });

  rows.push({ label: 'runner', value: runnerValue(details) });

  // ABSENT COUNTS ARE NOT ZERO - an older API sends no accounting at all, and
  // printing `captured 0` about it would assert something nobody said.
  if (diffScopeInfo?.capturedSnapshotCount !== undefined) {
    rows.push({
      label: 'diff scope',
      value:
        `captured ${diffScopeInfo.capturedSnapshotCount} · ` +
        `inherited ${diffScopeInfo.inheritedSnapshotCount ?? 0}`,
    });
  }

  if (viewStatusesCount) {
    // A VERDICT IS A HUMAN RULING, so it is approved plus reported and nothing
    // else: `noChanges` is the engine's own answer and `unreviewed` is the
    // absence of an answer. Neither is a verdict somebody cast.
    rows.push({
      label: 'verdicts cast',
      value: String(viewStatusesCount.approved + viewStatusesCount.reported),
    });
  }

  return rows;
}

/** `feature/login @ 4f3a9c1 (clean tree)`. */
function branchValue(git: BuildDetailsGitFacts): string {
  const shortSha = git.commitHash.slice(0, 7);
  const tree = git.isDirty === undefined ? '' : ` (${git.isDirty ? 'dirty' : 'clean'} tree)`;

  return `${git.branchName} @ ${shortSha}${tree}`;
}

/**
 * What the build was judged over.
 *
 * `true` is the server's frozen verdict that this build surfaces only what its
 * own branch caused, which by construction is a build off the main line - so
 * both halves of the sentence are the server's claim, not the CLI's.
 *
 * `false` says only that the build was judged over the whole suite. It does NOT
 * say the build is a main-line one: the flag folds a project opt-in together
 * with the branch axis, so `false` is also the answer for a project that never
 * opted in. Naming a build kind off it would be a guess.
 *
 * Absent is an older API and prints no row at all.
 */
function scopeValue(showsOnlyBranchChanges: boolean | undefined): string | undefined {
  if (showsOnlyBranchChanges === true) return 'branch-only · feature build';
  if (showsOnlyBranchChanges === false) return 'all stories';

  return undefined;
}

/** The plain-word run status, and the server's own reason when it errored. */
const RUNNER_WORD: Record<string, string> = {
  canceled: 'canceled',
  error: 'errored',
  finished: 'finished',
  inProgress: 'running',
  queued: 'queued',
  waiting: 'waiting',
};

function runnerValue({ runStatus, runError }: BuildDetails): string {
  // An unmapped status falls through to the raw wire value rather than to a
  // blank: a status this table has not learned yet is information, not nothing.
  const word = RUNNER_WORD[runStatus] ?? runStatus;

  if (runStatus !== 'error' || runError === undefined || runError === null) return word;

  // `runError` is server-shaped. A plain enum string prints as itself; anything
  // structured is stringified rather than phrased, exactly as the verdict
  // closer does with the same value.
  const reason = typeof runError === 'string' ? runError : JSON.stringify(runError);

  return `${word} (${reason})`;
}

/* ========================================================================== */
/* `--metadata`'s JSON contract (view-metadata, operator ruling 2026-09-03)    */
/* ========================================================================== */

/**
 * One row of `stories[]`, exactly as `getBuildStatus` sends it and exactly as
 * the JSON prints it - a field lift, like {@link BuildDetails} above, never a
 * translation. `status` stays a plain string (not a narrowed union) for the
 * same reason it does on the wire type in helpers/waitForBuildResult: a status
 * this CLI has not learned yet must still pass through.
 */
export type ViewMetadataStory = {
  name: string;
  status: string;
  baseline: { buildIndex: number } | null;
  reason?: string;
  candidates?: { buildIndex: number }[];
};

/**
 * The whole `sherlo view --metadata` JSON payload (view-metadata, operator
 * ruling 2026-09-03). This IS the contract - see docs/view-metadata-spec.md in
 * the epic branch history - so every key here is one the JSON prints under its
 * own name, in this order.
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
  stories?: ViewMetadataStory[];
};

/**
 * `--metadata`'s entire output: the JSON payload, pretty-printed, and nothing
 * else - no header, no colour, no url line. It is meant to be piped and parsed,
 * so the bytes are exactly `JSON.stringify(json, null, 2)`.
 */
export function renderViewMetadataJson(json: ViewMetadataJson): string {
  return JSON.stringify(json, null, 2);
}

/* ========================================================================== */
/* The stories table (human-readable, no `--metadata`)                       */
/* ========================================================================== */

/**
 * The per-story table `sherlo view` prints (without `--metadata`) under the
 * check sentence. Plain and aligned like {@link renderBuildDetails}'s block,
 * for the same reason: three columns, one row per story, widths driven by the
 * widest cell actually present.
 *
 * A `review-required` row's baseline column carries the reason instead of a
 * build index - there IS no baseline for that story (see
 * ViewMetadataStory.baseline), and printing blank there would read as an
 * omission rather than the answer.
 */
export function renderStoriesTable(stories: ViewMetadataStory[]): string[] {
  if (stories.length === 0) return [];

  const rows = stories.map((story) => ({
    name: story.name,
    status: story.status,
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

function baselineCell(story: ViewMetadataStory): string {
  if (story.baseline) return `build #${story.baseline.buildIndex}`;
  if (story.reason === 'two-baselines' && story.candidates) {
    return `two baselines (#${story.candidates.map((c) => c.buildIndex).join(', #')})`;
  }
  return '-';
}
