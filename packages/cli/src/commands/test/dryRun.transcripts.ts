/**
 * THE TRANSCRIPT SCENARIO CATALOG for `sherlo test --dry-run` - the storybook
 * file of the CLI's dry-run family.
 *
 * A storybook story is a component plus scripted props. A CLI transcript is a
 * command plus scripted state, and this is where that state is written down:
 * one entry per committed expectation fixture, living beside the command it
 * renders, so a CLI change that adds a line lands in the same PR as the scenario
 * that renders it.
 *
 * WHAT A SCENARIO MAY AND MAY NOT SAY. A scenario declares WIRE-SHAPED INPUTS -
 * the `computeDiffScopeDryRun` result the server would have returned, the
 * `BundleResult` the bundler would have produced - and nothing else. It can
 * never name a line of output, and it can never name a decision: the CLI's own
 * `buildBundles` loop and its own `runDryRunPreview` run unforked over this
 * state, so a rendered transcript proves the CLI's branching as well as its
 * bytes. Two type-level shields fall out of that and need no machinery:
 *
 *   1. `state.decision` is typed as {@link ComputeDiffScopeDryRunResult}, the
 *      contract-mirrored wire type. A state the backend could not shape is a
 *      `tsc` failure, not a review finding.
 *   2. `groundedBy` is a required field on a TypeScript type. A scenario with no
 *      declared provenance does not compile - an absence, not a rule.
 *
 * AMBIENT IS DECLARED, NEVER DEFAULTED. `skipIntro` is the one ambient read this
 * family touches that changes CONTENT (`SKIP_INTRO=true` removes ten lines).
 * Every scenario states it. A default that silently matches today is exactly how
 * the missing-config-rejection pair drifted.
 */
import { Platform } from '@sherlo/api-types';
import type { BundleResult } from './buildBundle';
import type { ComputeDiffScopeDryRunResult } from './dryRunDecision';

/**
 * Where a scenario's VALUES came from. Routing metadata for the reconciliation
 * lane, not a shield in its own right - an author willing to write a dishonest
 * state will write a grounding beside it. What makes the values true is the
 * ratchet: every scenario here renders byte-identically to a fixture a real
 * device run against the real backend produced and a person reviewed into git.
 */
export type TranscriptGrounding =
  /** Reconstructed from the committed fixture a real run produced; not yet re-grounded against the wire. */
  | { kind: 'derived'; fromFixture: string }
  /** A recorded real response, committed alongside. */
  | { kind: 'captured-run'; runId: number; wire: string }
  /** An exhaustive enum branch a live e2e cannot reach. */
  | { kind: 'enumerated'; why: string };

/**
 * One platform's scripted bundling outcome. Typed as the REAL {@link BundleResult}
 * minus the fields no transcript can see (the content hash), so a scenario can
 * only describe a bundle the bundler could actually have produced.
 */
export type ScriptedBundle = Pick<
  BundleResult,
  'bundlePath' | 'bundleSizeMb' | 'bundleFormat' | 'bundler'
> & {
  /** Present -> the `✓ Assets: N files` line is emitted; absent -> it is not. */
  assets?: string[];
  /**
   * The story-file keys of the module manifest this build produced. The real
   * `countBundleStories` counts them, and that count is the "of M" in the
   * capture plan. Absent -> no manifest, and the plan degrades exactly as it
   * does for a build the serializer emitted nothing for.
   */
  storyClosureKeys?: string[];
};

/** Everything a `--dry-run` transcript is a function of. */
export type DryRunTranscriptState = {
  /** Which platforms carry devices - drives the per-platform block order. */
  platformsToTest: Platform[];
  /** Per platform, what the bundler produced. Every platform under test needs one. */
  bundles: Partial<Record<Platform, ScriptedBundle>>;
  /**
   * false -> the git read failed and the CLI degrades: the `Couldn't get git
   * info` warn on stderr, and unknown commit/branch downstream.
   */
  gitInfoAvailable: boolean;
  /**
   * What the read-only decision query did. `answered` carries the wire result
   * verbatim (including `null`, which the CLI treats as uncertainty); `threw`
   * carries the error the transport raised, which bails the preview open for
   * every platform.
   */
  decision:
    | { outcome: 'answered'; result: ComputeDiffScopeDryRunResult }
    | { outcome: 'threw'; message: string };
};

export type TranscriptScenario = {
  description: string;
  groundedBy: TranscriptGrounding;
  ambient: { skipIntro: boolean };
  /**
   * Which streams the committed fixture is made of. `stdout+stderr` is the
   * concatenation the failure-mode spec judges - stderr lands after the whole
   * stdout capture, which is why the git warn reads at the end of the file even
   * though it was printed in the middle of the run.
   */
  capture: 'stdout' | 'stdout+stderr';
  /**
   * The committed fixture this scenario must render byte-identically, as a path
   * relative to the sherlo-tester repo ROOT - not to any one tree inside it. See
   * {@link FIXTURE_ROOTS} for the roots this catalog draws from.
   */
  fixture: string;
  state: DryRunTranscriptState;
};

/* ========================================================================== */

const BUNDLE_ROOT = '/Users/sherlo-user/my-app/node_modules/.cache/sherlo';

/** The seven story files the integrated Expo app's manifest carries. */
const SEVEN_STORIES = [
  'src/components/Storefront/ProductCard.stories.tsx',
  'src/components/Storefront/SharedButton.stories.tsx',
  'src/components/Storefront/Header.stories.tsx',
  'src/components/Storefront/Footer.stories.tsx',
  'src/components/Storefront/Banner.stories.tsx',
  'src/components/Storefront/Cart.stories.tsx',
  'src/components/Storefront/Checkout.stories.tsx',
];

function bundleFor(platform: Platform): ScriptedBundle {
  return {
    bundlePath: `${BUNDLE_ROOT}/bundle.${platform}.js`,
    bundleSizeMb: 4.29,
    bundleFormat: 'plain-js',
    bundler: 'expo',
    assets: ['icon.png', 'splash.png'],
    storyClosureKeys: SEVEN_STORIES,
  };
}

/** Every platform answered "a real run would capture everything - first build". */
function firstBuildEverywhere(platforms: Platform[]): ComputeDiffScopeDryRunResult {
  return {
    platforms: platforms.map((platform) => ({
      platform,
      isFullCapture: true,
      reason: 'first build - nothing to compare against yet',
      capturedStoryFilePaths: [],
    })),
  };
}

const BOTH_PLATFORMS: Platform[] = ['android', 'ios'];

/**
 * THE FIXTURE ROOTS this catalog draws from, each a path relative to the
 * SHERLO-TESTER REPO ROOT - the base both consumers resolve a `fixture` against:
 * the ratchet's `committedFixture` joins it onto the checkout, and
 * `yarn tester expected-render --check` joins it onto that repository's root.
 *
 * Neither consumer has ever cared which tree inside the checkout a path lands
 * in; what this catalog lacked was a place to SAY which trees it draws from, so
 * that a fixture outside the snapshot trees reads as a decision rather than as a
 * typo nobody caught.
 */
export const FIXTURE_ROOTS = {
  /**
   * The suite snapshot trees: a fixture a Playwright spec captured from a real
   * device run against the real backend, and a person reviewed into git. Every
   * scenario below answers under this root.
   */
  suiteSnapshots: 'e2e/suites/snapshots',
  /**
   * The BEATS suites tree. A beats chapter keeps its kept-output fixtures BESIDE
   * THE CHAPTER, in Playwright's default snapshot sidecar, so a transcript a
   * beat shows is named:
   *
   *   `<saga>/<storyline>/<NN-chapter>.spec.ts-snapshots/<slot>-<Project-Name>-<platform>.txt`
   *
   * e.g. `diff-scope/closure/01-<chapter>.spec.ts-snapshots/<slot>-Diff-Scope-Closure-darwin.txt`.
   * That file name is not an author's choice: it carries the Playwright PROJECT
   * NAME with its spaces hyphenated, and the platform, because that is
   * Playwright's default `snapshotPathTemplate` and no beats project pins its
   * own - so the path a scenario names here follows from the project its chapter
   * runs under.
   *
   * A beat is read before any run of the behaviour exists - that is what an
   * expected report is - so a scenario answering under this root has no captured
   * snapshot behind it, and its `groundedBy` is `captured-run` or `enumerated`:
   * `derived` names an upstream fixture, and a beat has none.
   */
  beatsSnapshots: 'e2e-beats/suites',
} as const;

export const DRY_RUN_TRANSCRIPTS: Record<string, TranscriptScenario> = {
  'dry-run-single-platform-nothing-to-capture': {
    description:
      'One platform under test, and the server answers that NOTHING a change touches reaches a ' +
      'story - the partial-zero branch, which is the only branch that may print "nothing to ' +
      'capture" and the one the inversion hazard exists to protect.',
    groundedBy: {
      kind: 'derived',
      fromFixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled/06-single-platform.spec.ts-snapshots/u4-single-platform-cli-Test-Bundled-darwin.txt`,
    },
    ambient: { skipIntro: false },
    capture: 'stdout',
    fixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled/06-single-platform.spec.ts-snapshots/u4-single-platform-cli-Test-Bundled-darwin.txt`,
    state: {
      platformsToTest: ['android'],
      bundles: { android: bundleFor('android') },
      gitInfoAvailable: true,
      decision: {
        outcome: 'answered',
        result: {
          platforms: [
            {
              platform: 'android',
              isFullCapture: false,
              reason: 'no change reaches any story',
              capturedStoryFilePaths: [],
            },
          ],
        },
      },
    },
  },

  'dry-run-cold-start': {
    description:
      'Both platforms, first build on this project: the server answers a CONFIDENT full capture ' +
      'with a rung reason, so the plan reads "would capture all 7 stories in this bundle" plus the ' +
      'verbatim why - never the "couldn\'t compute" degrade.',
    groundedBy: {
      kind: 'derived',
      fromFixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled/09-cold-start.spec.ts-snapshots/c3-cold-start-cli-Test-Bundled-darwin.txt`,
    },
    ambient: { skipIntro: false },
    capture: 'stdout',
    fixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled/09-cold-start.spec.ts-snapshots/c3-cold-start-cli-Test-Bundled-darwin.txt`,
    state: {
      platformsToTest: BOTH_PLATFORMS,
      bundles: { android: bundleFor('android'), ios: bundleFor('ios') },
      gitInfoAvailable: true,
      decision: { outcome: 'answered', result: firstBuildEverywhere(BOTH_PLATFORMS) },
    },
  },

  'dry-run-provenance-guard-skip': {
    description:
      'The provenance guard skipped the ancestry it could not trust, so the server falls back to a ' +
      'first-build full capture. Renders byte-identically to the cold start - which is the point: ' +
      'the CLI has ONE rendering for "the server said full capture, first build", not a second one ' +
      'for the guard-skip route.',
    groundedBy: {
      kind: 'derived',
      fromFixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled/10-provenance-guard-skip.spec.ts-snapshots/c4b-guard-skip-cli-Test-Bundled-darwin.txt`,
    },
    ambient: { skipIntro: false },
    capture: 'stdout',
    fixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled/10-provenance-guard-skip.spec.ts-snapshots/c4b-guard-skip-cli-Test-Bundled-darwin.txt`,
    state: {
      platformsToTest: BOTH_PLATFORMS,
      bundles: { android: bundleFor('android'), ios: bundleFor('ios') },
      gitInfoAvailable: true,
      decision: { outcome: 'answered', result: firstBuildEverywhere(BOTH_PLATFORMS) },
    },
  },

  'dry-run-api-unreachable': {
    description:
      'THE BAIL-OPEN. The decision query throws (the API is unreachable), so the CLI has no ' +
      'trustworthy answer for ANY platform and previews every one as capture-everything with the ' +
      '"couldn\'t compute what changed" safety row. Note what is NOT here: no story count, because ' +
      "a bail-open carries no reason and no denominator - and no error text on the user's line.",
    groundedBy: {
      kind: 'derived',
      fromFixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled-checks/02-failure-modes.spec.ts-snapshots/f4-api-unreachable-cli-Test-Bundled-Checks-darwin.txt`,
    },
    ambient: { skipIntro: false },
    capture: 'stdout',
    fixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled-checks/02-failure-modes.spec.ts-snapshots/f4-api-unreachable-cli-Test-Bundled-Checks-darwin.txt`,
    state: {
      platformsToTest: BOTH_PLATFORMS,
      bundles: { android: bundleFor('android'), ios: bundleFor('ios') },
      gitInfoAvailable: true,
      decision: {
        outcome: 'threw',
        message: 'request to https://api.sherlo.io/graphql failed, reason: getaddrinfo ENOTFOUND',
      },
    },
  },

  'dry-run-detached-head': {
    description:
      'A detached HEAD still resolves a commit, so git info is AVAILABLE and the transcript is a ' +
      'normal cold start. The scenario exists because the fixture does: it is what proves the ' +
      'detached-head case degrades nothing a user sees.',
    groundedBy: {
      kind: 'derived',
      fromFixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled-checks/02-failure-modes.spec.ts-snapshots/f6-detached-head-cli-Test-Bundled-Checks-darwin.txt`,
    },
    ambient: { skipIntro: false },
    capture: 'stdout+stderr',
    fixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled-checks/02-failure-modes.spec.ts-snapshots/f6-detached-head-cli-Test-Bundled-Checks-darwin.txt`,
    state: {
      platformsToTest: BOTH_PLATFORMS,
      bundles: { android: bundleFor('android'), ios: bundleFor('ios') },
      gitInfoAvailable: true,
      decision: { outcome: 'answered', result: firstBuildEverywhere(BOTH_PLATFORMS) },
    },
  },

  'dry-run-no-git': {
    description:
      'Outside a git repository the CLI warns on STDERR and degrades to unknown commit/branch - it ' +
      'does not fail. The warn is printed in the MIDDLE of the run but reads at the END of the ' +
      'fixture, because the fixture is stdout followed by stderr.',
    groundedBy: {
      kind: 'derived',
      fromFixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled-checks/02-failure-modes.spec.ts-snapshots/f6-no-git-cli-Test-Bundled-Checks-darwin.txt`,
    },
    ambient: { skipIntro: false },
    capture: 'stdout+stderr',
    fixture: `${FIXTURE_ROOTS.suiteSnapshots}/test-bundled-checks/02-failure-modes.spec.ts-snapshots/f6-no-git-cli-Test-Bundled-Checks-darwin.txt`,
    state: {
      platformsToTest: BOTH_PLATFORMS,
      bundles: { android: bundleFor('android'), ios: bundleFor('ios') },
      gitInfoAvailable: false,
      decision: { outcome: 'answered', result: firstBuildEverywhere(BOTH_PLATFORMS) },
    },
  },
};

export const DRY_RUN_TRANSCRIPT_IDS = Object.keys(DRY_RUN_TRANSCRIPTS);
