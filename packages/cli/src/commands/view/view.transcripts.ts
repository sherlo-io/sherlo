/**
 * THE TRANSCRIPT SCENARIO CATALOG for the VIEW family (F5) - what `sherlo view`
 * prints about a build it has read.
 *
 * A storybook story is a component plus scripted props. A CLI transcript is a
 * command plus scripted state, and for this family the scripted state is exactly
 * one thing: THE BUILD READ. Every scenario declares a {@link BuildStatus} - the
 * shape `getBuildStatus` returns, imported from the file that declares it for
 * the shipped query, never re-typed here - and the shipped print path runs
 * unforked over it (./printBuildView, via ./renderViewTranscript).
 *
 * ------------------------------------------------------------------------
 * THIS FAMILY IS PRESENT-PROVING AND UNRATCHETED, AND BOTH HALVES MATTER.
 *
 * PRESENT-PROVING: these are the bytes the shipped CLI prints today for these
 * reads. Nothing here is behind a gate and nothing here depicts a future.
 *
 * UNRATCHETED: `sherlo view` is new, so no committed e2e fixture has ever
 * captured it. The scenarios below therefore answer for `fixture: null` exactly
 * as the verdict family does, and `yarn tester expected-render` reports the gap
 * out loud instead of writing a fixture nothing judges. What covers them in the
 * meantime is the unit gate (__tests__/viewTranscripts.test.ts), which pins the
 * visible shape and ordering, plus the per-segment literal pins in
 * render/__tests__/renderLayerLiterals.test.ts, which pin the escapes.
 *
 * ------------------------------------------------------------------------
 * WHAT NO SCENARIO HERE CAN SHOW, AND WHY THAT IS THE POINT OF LOOKING.
 *
 * No `view` transcript carries a branch, a commit or a baseline comparison,
 * because `getBuildStatus` does not return them - and it is the only build read
 * a project token is authorized for. A scenario that showed them would be a
 * drawing of a product the API cannot serve, which is exactly the mistake this
 * catalog's type makes impossible: the state is the WIRE shape, so a fact the
 * backend cannot send is a `tsc` failure rather than a transcript.
 */
import type { BuildStatus } from '../../helpers/waitForBuildResult';

/** Where a view scenario's values came from, and whether it is real today. */
export type ViewGrounding = {
  /**
   * The shipped code path, with no committed baseline to ratchet against
   * because the command is new. `coveredBy` names what stands in for one, so
   * "unratcheted" never reads as "uncovered".
   */
  kind: 'unratcheted-shipped';
  coveredBy: string;
};

export type ViewTranscriptScenario = {
  description: string;
  groundedBy: ViewGrounding;
  ambient: { skipIntro: boolean };
  capture: 'stdout' | 'stdout+stderr';
  /** The build the command is looking at. */
  buildIndex: number;
  /**
   * The read's answer, typed as the wire shape the shipped query selects, so a
   * state the backend could not return does not compile.
   */
  build: BuildStatus;
  /** `--metadata`: whether this scenario appends the `── details ──` block. */
  showDetails: boolean;
};

/* ========================================================================== */

/** The suite these scenarios describe, so the arithmetic in each one adds up. */
const SUITE_SIZE = 44;

/** Where every scenario's link points. Fixed ids - nothing here reads a token. */
export const SCENARIO_BUILD_URL = 'https://app.sherlo.io/build?t=tm000001&p=7&b=7';

const COVERED_BY =
  'the visible-shape gate in commands/view/__tests__/viewTranscripts.test.ts and the ' +
  'per-segment escape pins in render/__tests__/renderLayerLiterals.test.ts';

function scenario(
  description: string,
  build: BuildStatus,
  showDetails = false
): ViewTranscriptScenario {
  return {
    description,
    groundedBy: { kind: 'unratcheted-shipped', coveredBy: COVERED_BY },
    ambient: { skipIntro: true },
    capture: 'stdout',
    buildIndex: 7,
    build,
    showDetails,
  };
}

export const VIEW_TRANSCRIPTS: Record<string, ViewTranscriptScenario> = {
  'view-finished-no-changes': {
    ...scenario(
      'THE ORDINARY LOOK. A finished build whose whole suite matched, read back later by ' +
        "somebody who did not run it. The tally is the wire's own four counts and the sentence " +
        "under it is the GitHub check's, so a developer reading this and a reviewer reading the " +
        'check are looking at one verdict in one wording.',
      {
        runStatus: 'finished',
        status: 'noChanges',
        viewStatusesCount: {
          approved: 5,
          noChanges: SUITE_SIZE - 5,
          reported: 0,
          unreviewed: 0,
        },
      }
    ),
  },

  'view-finished-needs-review': {
    ...scenario(
      'THE ONE SOMEBODY IS WAITING ON. Three stories changed and nobody has looked at them. ' +
        'Note that the exit code is still 0: without `--wait` this command REPORTS a verdict, it ' +
        'does not gate on one - that is what `sherlo view <build> --wait` is for.',
      {
        runStatus: 'finished',
        status: 'unreviewed',
        viewStatusesCount: {
          approved: 0,
          noChanges: SUITE_SIZE - 3,
          reported: 0,
          unreviewed: 3,
        },
      }
    ),
  },

  'view-still-running': {
    ...scenario(
      'A BUILD THAT HAS NOT FINISHED. The review status the server sends is computed off the ' +
        'counts whatever the run is doing, so it already reads `unreviewed` here - and printing ' +
        '"changes need review" over a run still capturing would be false. The sentence says ' +
        'running instead, and the tally is withheld entirely because no counts have been written.',
      { runStatus: 'inProgress', status: 'unreviewed' }
    ),
  },

  'view-errored': {
    ...scenario(
      "THE RUN THAT DID NOT FINISH. The server's own error value reaches the details block " +
        'verbatim, and the sentence is the check\'s "errored" copy rather than a verdict about ' +
        'snapshots nobody captured.',
      { runStatus: 'error', runError: 'user_runner' },
      true
    ),
  },

  'view-metadata-branch-build': {
    ...scenario(
      'THE DETAILS BLOCK, over a branch build. Everything in it is a fact the wire actually ' +
        'sent: the scope is the verdict the SERVER froze onto the build, the accounting is the ' +
        'capture counts, and "verdicts cast" is approved plus reported - the two statuses a human ' +
        'has to put there. What is missing is missing for one reason: `getBuildStatus` carries no ' +
        'git info and no per-screen baseline, so no branch row and no comparison line can appear ' +
        'here however much a reader would like them to.',
      {
        runStatus: 'finished',
        status: 'unreviewed',
        showsOnlyBranchChanges: true,
        viewStatusesCount: { approved: 0, noChanges: 1, reported: 0, unreviewed: 2 },
        diffScopeInfo: { capturedSnapshotCount: 3, inheritedSnapshotCount: SUITE_SIZE - 3 },
      },
      true
    ),
  },

  'view-metadata-older-api': {
    ...scenario(
      'THE DEGRADE, and the case that proves the block never zero-fills. An API that predates ' +
        'the scope flag and the capture accounting sends neither, so those rows are ABSENT rather ' +
        'than reported as false and zero - and the label column narrows to the rows that remain, ' +
        'which is what "aligned to the widest label present" means.',
      {
        runStatus: 'finished',
        status: 'approved',
        viewStatusesCount: { approved: 4, noChanges: SUITE_SIZE - 4, reported: 0, unreviewed: 0 },
      },
      true
    ),
  },
};

export const VIEW_TRANSCRIPT_IDS = Object.keys(VIEW_TRANSCRIPTS);
