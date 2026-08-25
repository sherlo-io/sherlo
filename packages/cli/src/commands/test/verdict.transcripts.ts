/**
 * THE TRANSCRIPT SCENARIO CATALOG for the VERDICT family (F4) - what `--wait`
 * prints when a build reaches a terminal state.
 *
 * A storybook story is a component plus scripted props. A CLI transcript is a
 * command plus scripted state, and for this family the scripted state is exactly
 * one thing: THE POLL ANSWER. Every scenario below declares a
 * {@link BuildStatus} - the shape `getBuildStatus` returns, imported from the
 * file that declares it for the shipped query, never re-typed here - and the
 * verdict logic runs unforked over it.
 *
 * ------------------------------------------------------------------------
 * THIS FAMILY IS NOT RATCHETED, AND THAT IS A FINDING, NOT A SHORTCUT.
 *
 * Its three peers each bind every scenario to a committed fixture a real device
 * run produced, and `yarn tester expected-render --check` demands byte-identity
 * against it. This family cannot do that YET, because all three committed
 * `--wait` baselines are on AWAITING_REMINT:
 *
 *   suites/cli/test-standard/wait-clean/...push-wait-finished-CLI-Wait-Clean-darwin.txt
 *   suites/cli/test-standard/wait-review/...push-wait-review-CLI-Wait-Review-darwin.txt
 *   suites/cli/test-standard/wait-deadline/...push-wait-timeout-CLI-Wait-Deadline-darwin.txt
 *
 * (sherlo-tester e2e/__tests__/push-road-placeholders.test.ts). Each carries a
 * `Test <N>` token on line 13 that `maskPushOutput` has no rule to produce - the
 * same defect the push family's header names, for the same nine baselines. No
 * honest render can ever equal them, so binding one here would be a fixture
 * that fails for a reason that has nothing to do with this family. They are
 * named above rather than omitted, so the gap is visible instead of looking like
 * completeness. When the re-mint dispatch lands, `fixture` becomes fillable for
 * the three PRESENT-PROVING scenarios below and this family joins the ratchet.
 *
 * ------------------------------------------------------------------------
 * TWO KINDS OF SCENARIO LIVE HERE, AND `groundedBy` IS HOW YOU TELL.
 *
 *   PRESENT-PROVING (`kind: 'awaiting-remint'`) - the bytes the SHIPPED
 *   `waitForBuildResult` prints today, rendered by running that function over a
 *   scripted poll. Unratcheted only because its fixture is broken; the code path
 *   is the live one.
 *
 *   DEPICTS-FUTURE (`kind: 'depicts-future'`) - bytes NO shipped code path
 *   emits. Rendered by `decideSparseBuildVerdict`, which nothing in the product
 *   calls. These are the redesign's proposal, drawn so it can be reviewed before
 *   it is built. A reader who wants one test for "is this real today?" has it:
 *   a depicts-future transcript's grounding says so, and `--render-transcript
 *   list` prints the grounding beside every id.
 */
import type { BuildStatus } from '../../helpers/waitForBuildResult';

/** Where a verdict scenario's values came from, and whether it is real today. */
export type VerdictGrounding =
  /**
   * The shipped code path, whose committed fixture is currently unrenderable -
   * it carries a masked token its own masker cannot produce. `fixture` names the
   * baseline this scenario will bind to once the re-mint dispatch clears it.
   */
  | { kind: 'awaiting-remint'; fixture: string; token: string }
  /**
   * ⚠⚠ Depicts behaviour NOTHING implements. `implies` says what would have to
   * be built for these bytes to become real, so a reader is never left inferring
   * how big the gap is.
   */
  | { kind: 'depicts-future'; implies: string };

/** Which decider renders a scenario - the shipped loop, or the unwired proposal. */
export type VerdictRenderer = 'shipped-wait-loop' | 'sparse-verdict-proposal';

export type VerdictTranscriptScenario = {
  description: string;
  groundedBy: VerdictGrounding;
  ambient: { skipIntro: boolean };
  capture: 'stdout' | 'stdout+stderr';
  renderer: VerdictRenderer;
  /**
   * The poll answer, typed as the wire shape the shipped query selects. A state
   * the backend could not return is a `tsc` failure - which is the shield that
   * matters most in this family, because these renders exist to have a PRODUCT
   * DESIGN approved off them: a transcript depicting a build the engine can
   * never produce would let us approve something that cannot exist.
   */
  build: BuildStatus;
  /** How long the run was told to wait - the `⏳` header prints it. */
  waitTimeoutMinutes: number;
};

/* ========================================================================== */

/**
 * The suite these scenarios describe: forty-four snapshot entries across the
 * branch's whole story catalog. Every accounting line below adds up to it, so a
 * reader can check the arithmetic rather than take the numbers on trust.
 */
const SUITE_SIZE = 44;

/** A finished build's poll answer, with the tally and accounting a scenario chooses. */
function finished({
  approved = 0,
  noChanges = 0,
  reported = 0,
  unreviewed = 0,
  captured,
  inherited,
}: {
  approved?: number;
  noChanges?: number;
  reported?: number;
  unreviewed?: number;
  captured?: number;
  inherited?: number;
}): BuildStatus {
  return {
    runStatus: 'finished',
    viewStatusesCount: { approved, noChanges, reported, unreviewed },
    ...(captured === undefined
      ? {}
      : { diffScopeInfo: { capturedSnapshotCount: captured, inheritedSnapshotCount: inherited } }),
  };
}

export const VERDICT_TRANSCRIPTS: Record<string, VerdictTranscriptScenario> = {
  /* --- what ships today ---------------------------------------------------- */

  'verdict-today-all-passed': {
    description:
      "TODAY'S GREEN. Every story either matched its baseline or was already approved, so the " +
      'shipped loop prints one line and exits 0. It is also the transcript the defect hides ' +
      'inside: the SAME branch renders these bytes when the tally is all-zero because the build ' +
      'recorded nothing, and the GitHub check calls that same build action_required.',
    groundedBy: {
      kind: 'awaiting-remint',
      fixture:
        'e2e/suites/cli/test-standard/wait-clean/01-wait-clean.spec.ts-snapshots/push-wait-finished-CLI-Wait-Clean-darwin.txt',
      token: 'Test <N>',
    },
    ambient: { skipIntro: true },
    capture: 'stdout',
    renderer: 'shipped-wait-loop',
    build: finished({ approved: 5, noChanges: SUITE_SIZE - 5 }),
    waitTimeoutMinutes: 45,
  },

  'verdict-today-review-required': {
    description:
      "TODAY'S BLOCK. Three stories changed and nobody has looked at them, so the loop exits 1 " +
      'and names the count. Note what it does NOT say: which stories, or how much of the suite ' +
      'this build even photographed.',
    groundedBy: {
      kind: 'awaiting-remint',
      fixture:
        'e2e/suites/cli/test-standard/wait-review/01-wait-review.spec.ts-snapshots/push-wait-review-CLI-Wait-Review-darwin.txt',
      token: 'Test <N>',
    },
    ambient: { skipIntro: true },
    capture: 'stdout',
    renderer: 'shipped-wait-loop',
    build: finished({ noChanges: SUITE_SIZE - 3, unreviewed: 3 }),
    waitTimeoutMinutes: 45,
  },

  'verdict-today-server-bypassed': {
    description:
      'The build the SERVER closed without a device run: zero captures, the whole suite ' +
      "inherited. The closer is compact and carries the server's own prose verbatim - the one " +
      'place the CLI already says something about capture accounting, and the shape the sparse ' +
      'verdict below generalises.',
    groundedBy: {
      kind: 'awaiting-remint',
      fixture:
        'e2e/suites/cli/test-standard/wait-clean/01-wait-clean.spec.ts-snapshots/push-wait-finished-CLI-Wait-Clean-darwin.txt',
      token: 'Test <N>',
    },
    ambient: { skipIntro: true },
    capture: 'stdout',
    renderer: 'shipped-wait-loop',
    build: {
      runStatus: 'finished',
      viewStatusesCount: { approved: 0, noChanges: SUITE_SIZE, reported: 0, unreviewed: 0 },
      diffScopeInfo: {
        capturedSnapshotCount: 0,
        inheritedSnapshotCount: SUITE_SIZE,
        platforms: { android: { reason: 'no change on this branch reaches any story' } },
      },
    },
    waitTimeoutMinutes: 45,
  },

  /* --- ⚠⚠ what the branch-build redesign implies. Nothing implements these. -- */

  'verdict-branch-build-nothing-differed': {
    description:
      '⚠⚠ DEPICTS FUTURE. THE FIRST OUTPUT THE REDESIGN NEEDS. A branch build that ran, ' +
      'photographed the three stories its own diff reaches, and found all three identical. ' +
      'Today this exits 0 saying "All stories passed" while the required check independently ' +
      "re-derives unreviewed and posts action_required. Here it is `noChanges` in the CHECK'S " +
      'OWN WORDS, and the accounting line says how little of the suite the branch actually ' +
      'touched - which is the whole claim a sparse build is making.',
    groundedBy: {
      kind: 'depicts-future',
      implies:
        'waitForBuildResult routes its finished branch through decideSparseBuildVerdict, and the ' +
        'API stops re-deriving `unreviewed` from an all-zero tally that has capture accounting ' +
        'behind it.',
    },
    ambient: { skipIntro: true },
    capture: 'stdout',
    renderer: 'sparse-verdict-proposal',
    build: finished({ noChanges: 3, captured: 3, inherited: SUITE_SIZE - 3 }),
    waitTimeoutMinutes: 45,
  },

  'verdict-branch-build-only-the-branch-stories': {
    description:
      '⚠⚠ DEPICTS FUTURE. THE ORDINARY SPARSE CASE. The same branch, one commit later: of the ' +
      'three stories it caused to be captured, two differ. The verdict is a block, and the ' +
      'accounting line is what makes it readable - two unreviewed out of THREE captured, not two ' +
      'out of forty-four, so a reviewer knows the branch is being judged on its own surface.',
    groundedBy: {
      kind: 'depicts-future',
      implies:
        'the same routing as above, plus the capture accounting being printed on the block path ' +
        'as well as the green one.',
    },
    ambient: { skipIntro: true },
    capture: 'stdout',
    renderer: 'sparse-verdict-proposal',
    build: finished({ noChanges: 1, unreviewed: 2, captured: 3, inherited: SUITE_SIZE - 3 }),
    waitTimeoutMinutes: 45,
  },

  'verdict-branch-build-recorded-nothing': {
    description:
      '⚠⚠ DEPICTS FUTURE. THE CASE THE GUARD EXISTS FOR, and the reason the green above is ' +
      'guarded by a count rather than by the tally alone. This build finished with the same ' +
      'all-zero tally as a perfectly clean branch - but it captured nothing AND inherited ' +
      'nothing, so it is evidence of nothing. It must not go green, and it does not: this is ' +
      'today\'s "we do not know why" case, kept exactly where it is.',
    groundedBy: {
      kind: 'depicts-future',
      implies:
        'decideSparseBuildVerdict being the routing, which is what makes an all-zero tally ' +
        'ambiguous rather than automatically green.',
    },
    ambient: { skipIntro: true },
    capture: 'stdout',
    renderer: 'sparse-verdict-proposal',
    build: finished({ captured: 0, inherited: 0 }),
    waitTimeoutMinutes: 45,
  },
};

export const VERDICT_TRANSCRIPT_IDS = Object.keys(VERDICT_TRANSCRIPTS);
