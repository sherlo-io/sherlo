/**
 * ⚠⚠ DEPICTS FUTURE - NOTHING IN THE SHIPPED CLI CALLS THIS.
 *
 * The verdict a BRANCH BUILD would earn under sparse-build rules, as a pure
 * function of the poll answer the backend already returns. It exists so the
 * redesign's CLI half can be RENDERED and reviewed before it is built - the
 * operator's build order is surfaces first, engine second - and it is
 * deliberately not wired into {@link waitForBuildResult}: a real user's run
 * today takes exactly the path it took yesterday.
 *
 * HOW A READER TELLS THIS APART FROM THE PRESENT. Three independent marks, any
 * one of which is enough:
 *   1. this banner, and the same banner on every renderer it reaches
 *      (render/verdictCloser.ts, the three kinds under the DEPICTS FUTURE rule
 *      in render/segments.ts);
 *   2. no import of this module from anything under `src/commands/` or from
 *      `waitForBuildResult` - it is reachable only from the transcript producer
 *      and its tests, which a grep for the filename shows in full;
 *   3. every transcript it renders declares `groundedBy: { kind:
 *      'depicts-future' }` in the catalog, and that grounding kind is printed in
 *      `--render-transcript list`.
 *
 * ------------------------------------------------------------------------
 * THE DEFECT IT ANSWERS, stated as the two surfaces that disagree.
 *
 * A build that finished with `unreviewed: 0, reported: 0` exits GREEN here and
 * prints `All stories passed` (waitForBuildResult's `finished` branch). The
 * GitHub check, looking at the SAME build, re-derives its own state from the
 * same tally and - when the tally is all-zero because nothing was recorded -
 * lands on `unreviewed`, whose conclusion is `action_required`
 * (sherlo-api `deriveBuildCheckState` -> `mapBuildStateToCheckRun`). So the CLI
 * says pass and the required check says block, over one build. The exit-code
 * contract's own header in waitForBuildResult claims the two "never drift"; on
 * this input they do.
 *
 * THE OPERATOR'S RULING, implemented below and nowhere else: reuse the EXISTING
 * `noChanges` state and its EXISTING copy, guarded by the CAPTURE COUNT.
 *   - the build RECORDED entries and none differed  -> `no-changes`, green.
 *   - the build recorded NOTHING at all             -> unchanged from today's
 *     "we do not know why" case, and it does NOT go green.
 * The second half is the whole point of the guard. An all-zero tally is
 * ambiguous on its own: it is what a perfectly clean branch looks like AND what
 * a build that never photographed anything looks like. Only the capture
 * accounting separates them, and reading a zero as "nothing changed" would turn
 * every silently-empty run into a passing required check.
 */
import type { BuildStatus } from './waitForBuildResult';
import type { TranscriptSegment } from '../render/segments';
import { EXIT_BLOCK, EXIT_GREEN } from './waitForBuildResult';

/** What the sparse verdict decided, and the bytes it would print to say so. */
export type SparseBuildVerdict = {
  /**
   * Which normalized state the GitHub check would post for this same build.
   * Named in the CHECK's vocabulary (`BuildCheckState` in sherlo-api's
   * `mapBuildStateToCheckRun`) on purpose: the two surfaces disagreeing is the
   * defect, so the CLI's decision is expressed in terms the check shares rather
   * than in a private CLI vocabulary that could drift again.
   */
  checkState: 'noChanges' | 'unreviewed' | 'reported';
  /** The process exit code, under the same contract the shipped loop uses. */
  exitCode: number;
  /** The closer, WITHOUT its framing blank lines - the caller emits those. */
  segments: TranscriptSegment[];
};

/**
 * How many snapshot entries this build accounted for at all - captured on this
 * branch plus inherited unchanged from the build it branched from.
 *
 * ABSENT COUNTS ARE NOT ZERO. An older API answers with no `diffScopeInfo`, and
 * reading that absence as "recorded nothing" would push every such build into
 * the not-green branch. `undefined` therefore means UNKNOWN and is returned as
 * such, so the caller can keep today's behaviour rather than invent a verdict
 * from a field the server never sent.
 */
function recordedEntryCount(build: BuildStatus): number | undefined {
  const info = build.diffScopeInfo;
  if (!info) return undefined;
  if (info.capturedSnapshotCount === undefined && info.inheritedSnapshotCount === undefined) {
    return undefined;
  }
  return (info.capturedSnapshotCount ?? 0) + (info.inheritedSnapshotCount ?? 0);
}

/**
 * Decide a finished build's verdict under sparse rules.
 *
 * Takes the whole poll answer rather than the two counts, because the guard the
 * ruling turns on lives in a different field of the same answer - handing this
 * function pre-extracted counts is exactly how the capture guard would get lost
 * at a call site later.
 *
 * `null` means NOT TERMINAL: the build has not finished, or it finished but its
 * counts have not been written yet. The shipped loop already treats the second
 * case as "poll again" rather than defaulting the counts to zero, and so does
 * this - a false green is the one answer that must never be reachable by
 * accident.
 */
export function decideSparseBuildVerdict(build: BuildStatus): SparseBuildVerdict | null {
  if (build.runStatus !== 'finished') return null;

  const counts = build.viewStatusesCount;
  if (!counts) return null;

  const { reported, unreviewed } = counts;

  if (unreviewed > 0 || reported > 0) {
    return {
      checkState: reported > 0 ? 'reported' : 'unreviewed',
      exitCode: EXIT_BLOCK,
      segments: [
        { kind: 'verdict-review-required', unreviewed, reported },
        ...captureAccounting(build),
      ],
    };
  }

  const recorded = recordedEntryCount(build);

  // The server answered with no capture accounting at all (an older API). There
  // is no guard to apply, so this degrades to exactly what ships today rather
  // than to a verdict computed from a field that was never sent.
  if (recorded === undefined) {
    return {
      checkState: 'noChanges',
      exitCode: EXIT_GREEN,
      segments: [{ kind: 'verdict-passed' }],
    };
  }

  // Nothing was recorded: no captures, no inheritances. An all-zero tally over
  // an all-zero suite is evidence of nothing, so it does not go green.
  if (recorded === 0) {
    return {
      checkState: 'unreviewed',
      exitCode: EXIT_BLOCK,
      segments: [{ kind: 'verdict-nothing-recorded' }],
    };
  }

  // The build recorded entries and none of them differed. THIS is `noChanges`,
  // and it says so in the check's own words.
  return {
    checkState: 'noChanges',
    exitCode: EXIT_GREEN,
    segments: [{ kind: 'verdict-no-changes' }, ...captureAccounting(build)],
  };
}

/**
 * The `N captured, M inherited` line, when the server sent the numbers to say
 * it with. Omitted rather than zero-filled: a build whose accounting is unknown
 * prints no accounting, which is the honest rendering of an absent field.
 */
function captureAccounting(build: BuildStatus): TranscriptSegment[] {
  const info = build.diffScopeInfo;
  if (!info || info.capturedSnapshotCount === undefined) return [];

  return [
    {
      kind: 'verdict-capture-accounting',
      captured: info.capturedSnapshotCount,
      inherited: info.inheritedSnapshotCount ?? 0,
    },
  ];
}
