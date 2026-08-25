/**
 * THE SPARSE-BUILD VERDICT - what `--wait` prints and exits with for a build the
 * server marked `showsOnlyBranchChanges`.
 *
 * This is a pure function of the poll answer the backend already returns, and it
 * ships: {@link waitForBuildResult}'s finished branch routes through it whenever
 * {@link routesThroughSparseVerdict} says the server turned the gate on for this
 * build. A build that is NOT marked never reaches this file, and prints exactly
 * what it printed yesterday.
 *
 * ------------------------------------------------------------------------
 * THE DEFECT IT ANSWERS, stated as the two surfaces that disagreed.
 *
 * A build that finished with `unreviewed: 0, reported: 0` exits GREEN today and
 * prints `All stories passed`. The GitHub check, looking at the SAME build,
 * re-derives its own state from the same tally and - when the tally is all-zero
 * because nothing was recorded - lands on `unreviewed`, whose conclusion is
 * `action_required`. So the CLI said pass and the required check said block,
 * over one build. The exit-code contract's own header claimed the two "never
 * drift"; on this input they did.
 *
 * ------------------------------------------------------------------------
 * HOW IT REPAIRS THAT, AND THE ONE THING IT REFUSES TO DO.
 *
 * IT DOES NOT COMPUTE GREENNESS. That is the whole repair. The defect was two
 * surfaces deriving one build's verdict from one tally by two different
 * formulas; a third formula here - however carefully written - would be the same
 * mistake one layer further out. So on this path the CLI reads
 * `build.status`, which is the server's own answer, the SAME value
 * `deriveBuildCheckState` hands the GitHub check for this build:
 *
 *   `noChanges` / `approved`   -> green, exit 0
 *   `unreviewed` / `reported`  -> not green, exit 1
 *
 * The two surfaces now cannot drift, because there is only one derivation left.
 *
 * WHAT IT STILL DECIDES: WHICH WORDS. Greenness is the server's; the message is
 * the CLI's, and one message needs a fact the status cannot carry.
 * `status: 'unreviewed'` is the answer for BOTH "two stories are waiting for a
 * human" and "this build recorded nothing at all, so we do not know why" - the
 * SHERLO-2013 fallthrough. Those are the same verdict and very different
 * sentences, and only the capture accounting separates them. So the recorded
 * count chooses the COPY on a non-green build and never the exit code: the
 * safety net is narrowed to the case it was built for, and is not weakened by an
 * inch, because either way the build does not go green.
 *
 * THE OPERATOR'S RULINGS, and where each one actually lives now:
 *   - the build RECORDED entries and none differed -> `noChanges`, green,
 *     reusing the EXISTING state's EXISTING copy. Enforced SERVER-SIDE, over the
 *     recorded entries themselves; read here off `status`.
 *   - the build recorded NOTHING at all -> not green, and it says so in its own
 *     words rather than claiming zero stories need review.
 *   - a server-bypassed build (zero captured, the whole suite inherited) is
 *     green today and stays green: it records a full set of `noChanges` entries,
 *     so the server's status is `noChanges` and no new arm is involved.
 */
import type { BuildStatus } from './waitForBuildResult';
import type { TranscriptSegment } from '../render/segments';
import { EXIT_BLOCK, EXIT_GREEN } from './exitCodes';

/** What the sparse verdict decided, and the bytes it prints to say so. */
export type SparseBuildVerdict = {
  /**
   * The build's review status, as the SERVER computed it and the GitHub check
   * reads it. Carried through rather than re-labelled so that a reader of this
   * verdict is looking at the same word both surfaces are looking at.
   */
  checkState: NonNullable<BuildStatus['status']>;
  /** The process exit code, under the same contract the shipped loop uses. */
  exitCode: number;
  /** The closer, WITHOUT its framing blank lines - the caller emits those. */
  segments: TranscriptSegment[];
};

/**
 * Whether this build's verdict comes from the sparse decider rather than from
 * the count-based branch that has always shipped.
 *
 * BOTH HALVES ARE REQUIRED, and the second one is not a formality. The gate says
 * the server intends sparse rules for this build; `status` is the answer those
 * rules are read from. An API that sent the gate but not the status has given us
 * no verdict to mirror, and the only safe reading of a half-answer is to keep
 * today's behaviour rather than to guess - so that build takes the ungated path
 * and prints what it always did.
 *
 * `=== true` rather than a truthiness test, because the meaningful third value
 * here is ABSENT: every project that has not opted in, and every response from
 * an API that predates the field, arrives with no `showsOnlyBranchChanges` at
 * all, and every one of them must stay on the untouched path.
 */
export function routesThroughSparseVerdict(build: BuildStatus): boolean {
  return build.showsOnlyBranchChanges === true && build.status !== undefined;
}

/**
 * How many snapshot entries this build accounted for at all - captured on this
 * branch plus inherited unchanged from the build it branched from.
 *
 * ABSENT COUNTS ARE NOT ZERO. An older API answers with no `diffScopeInfo`, and
 * reading that absence as "recorded nothing" would put every such build's
 * not-green closer into the wrong words. `undefined` therefore means UNKNOWN and
 * is returned as such, so the caller can say the ordinary thing rather than
 * assert something about a field the server never sent.
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
 * Takes the whole poll answer rather than the status and the two counts, because
 * the facts this needs live in three different fields of one answer - handing it
 * pre-extracted values is exactly how the capture accounting would get lost at a
 * call site later.
 *
 * `null` means NOT TERMINAL: the build has not finished, its counts have not
 * been written yet, or the server sent no status. The shipped loop already
 * treats the counts race as "poll again" rather than defaulting to zero, and so
 * does this - a false green is the one answer that must never be reachable by
 * accident.
 */
export function decideSparseBuildVerdict(build: BuildStatus): SparseBuildVerdict | null {
  if (build.runStatus !== 'finished') return null;

  const counts = build.viewStatusesCount;
  if (!counts) return null;

  const checkState = build.status;
  if (checkState === undefined) return null;

  if (checkState === 'noChanges' || checkState === 'approved') {
    return {
      checkState,
      exitCode: EXIT_GREEN,
      segments: [{ kind: 'verdict-no-changes' }, ...captureAccounting(build)],
    };
  }

  // Not green. The status has already settled that; all that is left is which
  // sentence tells the truth about it.
  //
  // A build that recorded nothing - no captures, no inheritances - reached its
  // all-zero tally because nothing happened, not because nothing changed. Saying
  // "0 stories unreviewed" about it would be technically accurate and actively
  // misleading, so it gets the words for the thing that actually occurred.
  if (recordedEntryCount(build) === 0) {
    return {
      checkState,
      exitCode: EXIT_BLOCK,
      segments: [{ kind: 'verdict-nothing-recorded' }],
    };
  }

  return {
    checkState,
    exitCode: EXIT_BLOCK,
    segments: [
      { kind: 'verdict-review-required', unreviewed: counts.unreviewed, reported: counts.reported },
      ...captureAccounting(build),
    ],
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
