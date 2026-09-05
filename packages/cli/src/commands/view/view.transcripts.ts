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
 * A `view` TRANSCRIPT CAN NOW CARRY A BRANCH, A COMMIT AND A BASELINE
 * (view-metadata, operator ruling 2026-09-03) - a correction to this file's
 * earlier claim that none of it could ever appear here. `getBuildStatus` now
 * returns the build's frozen `gitInfo` and per-story `stories[]`, so a scenario
 * that scripts them is describing a real answer the project-token read can
 * send, not a drawing of a product the API cannot serve. The type stays the
 * enforcement mechanism either way: a fact this catalog scripts that the wire
 * cannot send is still a `tsc` failure, not a runtime one.
 */
import getAppBuildUrl from '../../helpers/getAppBuildUrl';
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
  /**
   * `--metadata`: whether this scenario renders the JSON contract INSTEAD of
   * the human view (view-metadata, operator ruling 2026-09-03) - not a block
   * appended after it, a different output entirely.
   */
  showDetails: boolean;
};

/* ========================================================================== */

/** The suite these scenarios describe, so the arithmetic in each one adds up. */
const SUITE_SIZE = 44;

/**
 * The team and project every scripted link is composed under. Fixed ids -
 * nothing here reads a token, and no scenario needs a real one to be renderable.
 */
const SCENARIO_TEAM_ID = 'tm000001';
const SCENARIO_PROJECT_INDEX = 7;

/**
 * Where a scripted transcript's link points, composed by the SHIPPED url helper
 * rather than written out - so a change to the app's build-url shape reaches
 * these transcripts the same day it reaches a real run.
 *
 * It takes the build index because a POSE may name any build (see ./viewPose),
 * and a transcript about build 3 that linked to build 7 would be lying about the
 * one thing in it a reader would click.
 */
export function scenarioBuildUrl(buildIndex: number): string {
  return getAppBuildUrl({
    buildIndex,
    projectIndex: SCENARIO_PROJECT_INDEX,
    teamId: SCENARIO_TEAM_ID,
  });
}

/** The link every scenario in the catalog below shows - all of them are build 7. */
export const SCENARIO_BUILD_URL = scenarioBuildUrl(7);

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
      'THE RUN THAT DID NOT FINISH, under `--metadata`. `--metadata` prints ONLY the JSON ' +
        'contract, so an errored build with no counts and no gitInfo prints the two facts the ' +
        'wire actually sent (runStatus, buildIndex) and nothing else - no zero-filled ' +
        'viewStatusesCount, no empty stories array.',
      { runStatus: 'error', runError: 'user_runner' },
      true
    ),
  },

  'view-metadata-branch-build': {
    ...scenario(
      'THE JSON CONTRACT, over a branch build with one review-required story. `commit` is the ' +
        "build's frozen gitInfo, `stories[]` is the per-story wire answer verbatim, and the " +
        '`review-required` row carries `reason: "two-baselines"` with the two candidate builds ' +
        'the ancestry walk could not choose between - exactly the shape docs/view-metadata-spec.md ' +
        'describes. `--metadata` prints ONLY this JSON: no header, no colour, no url line.',
      {
        runStatus: 'finished',
        status: 'unreviewed',
        gitInfo: {
          branchName: 'e2e/sherlo-3/dev',
          commitHash: '4f3a9c1d2e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c',
        },
        viewStatusesCount: { approved: 5, noChanges: 0, reported: 0, unreviewed: 1 },
        stories: [
          {
            name: 'Typography - Scales',
            status: 'review-required',
            baseline: null,
            reason: 'two-baselines',
            candidates: [{ buildIndex: 2 }, { buildIndex: 4 }],
          },
          { name: 'Typography - Dense', status: 'unchanged', baseline: { buildIndex: 1 } },
          { name: 'Sanity/Hello - Basic', status: 'unchanged', baseline: { buildIndex: 1 } },
        ],
      },
      true
    ),
  },

  'view-metadata-older-api': {
    ...scenario(
      'THE DEGRADE, and the case that proves the JSON never zero-fills or invents. An API that ' +
        'predates gitInfo and stories sends neither, so `commit` and `stories` are ABSENT from the ' +
        'JSON (not `null`, not `[]`) - `JSON.stringify` drops an `undefined` key rather than ' +
        'printing a fact nobody sent.',
      {
        runStatus: 'finished',
        status: 'approved',
        viewStatusesCount: { approved: 4, noChanges: SUITE_SIZE - 4, reported: 0, unreviewed: 0 },
      },
      true
    ),
  },

  'view-metadata-diff-scope': {
    ...scenario(
      'THE DIFF SCOPE BLOCK, under `--metadata`. A partial-capture build: one story was left ' +
        'out of this run and its accepted ancestor image was carried forward untouched - its ' +
        'status reads `not-captured` (distinct from `unchanged`, which means a fresh capture ' +
        "matched its baseline), and the wire's own `diffScope` names it in `inherited` alongside " +
        "the build it was carried from. `reason` is the server's own prose, printed verbatim.",
      {
        runStatus: 'finished',
        status: 'unreviewed',
        gitInfo: {
          branchName: 'feature/checkout',
          commitHash: '9c8b7a6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
        },
        viewStatusesCount: { approved: 0, noChanges: 1, reported: 0, unreviewed: 1 },
        stories: [
          { name: 'Sanity/Hello - Basic', status: 'changed', baseline: { buildIndex: 6 } },
          {
            name: 'Typography - Dense',
            status: 'not-captured',
            baseline: { buildIndex: 6 },
          },
        ],
        diffScope: {
          reason: 'Card.stories.tsx changed',
          captured: ['Sanity/Hello - Basic'],
          inherited: ['Typography - Dense'],
          ancestorBuildIndex: 6,
        },
      },
      true
    ),
  },

  'view-finished-with-stories-table': {
    ...scenario(
      'THE HUMAN VIEW, with stories. Without `--metadata` the per-story table sits between the ' +
        "check's sentence and the link: one row per story, its status, and its baseline build - " +
        'or, for the one review-required row, the two candidates instead of a baseline, since ' +
        'there IS no baseline for that story.',
      {
        runStatus: 'finished',
        status: 'unreviewed',
        viewStatusesCount: { approved: 1, noChanges: 1, reported: 0, unreviewed: 1 },
        stories: [
          {
            name: 'Typography - Scales',
            status: 'review-required',
            baseline: null,
            reason: 'two-baselines',
            candidates: [{ buildIndex: 2 }, { buildIndex: 4 }],
          },
          { name: 'Typography - Dense', status: 'unchanged', baseline: { buildIndex: 1 } },
          { name: 'Sanity/Hello - Basic', status: 'approved', baseline: { buildIndex: 1 } },
        ],
      }
    ),
  },
};

export const VIEW_TRANSCRIPT_IDS = Object.keys(VIEW_TRANSCRIPTS);
