/**
 * THE TRANSCRIPT SCENARIO CATALOG for the PUSH SPINE - the storybook file of the
 * CLI's largest transcript family.
 *
 * A storybook story is a component plus scripted props. A CLI transcript is a
 * command plus scripted state, and this is where that state is written down: one
 * entry per committed expectation fixture, living beside the command it renders,
 * so a CLI change that adds a line lands in the same PR as the scenarios that
 * render it.
 *
 * WHAT A SCENARIO MAY AND MAY NOT SAY. It declares WIRE-SHAPED INPUTS - the
 * `BinariesInfo` the backend answered with, the `GitInfo` the repo was in, the
 * `GateMetadataInput` a binary would have carried, the `EasUpdateData` the update
 * publisher reported - and nothing else. It can never name a line of output, and
 * it can never name a decision: `uploadOrReuseBuildsAndRunTests` runs unforked
 * over this state, so a rendered transcript proves the CLI's branching as well as
 * its bytes.
 *
 * THE SHARPEST CASE OF THAT RULE IN THIS FAMILY: the `WARNING: Staged uploads
 * unavailable - Debug builds without an embedded JS bundle cannot be staged...`
 * line that twenty-nine of these fixtures carry. A scenario does NOT write that
 * sentence. It declares `gateMetadata.hasEmbeddedBundle: false` against a
 * `development` buildType; the shipped `checkStageable` picks the branch and
 * phrases the reason, and the shipped `registerBase` decides it is worth warning
 * about. Reword it in the product and twenty-nine fixtures red - which is
 * precisely what should happen.
 *
 * WHY THE ENTRIES ARE BUILT FROM A HELPER RATHER THAN SPELLED OUT LONGHAND.
 * Thirty-one committed fixtures differ in FIVE values and nothing else: which
 * test number this is, how many devices, whether the binary uploaded or was
 * reused, whether the working tree was clean, and the EAS branch. Writing the
 * other forty fields out thirty-one times would not make any scenario more
 * honest - it would make a change to the shared shape a thirty-one-file edit,
 * and it would bury the five values that actually distinguish one fixture from
 * the next. {@link pushScenario} takes exactly those five and nothing else, so
 * every entry below reads as the delta it is.
 *
 * WHAT IS *NOT* HERE, and by name: the two `cli/bundled-fast-path` fixtures.
 * They are the STAGED road (`stagedRun.ts`) - a bundling header, a bundle block
 * and a `🔗 Review:` closer - not this spine, and they belong to the family
 * after this one. And the nine baselines on `AWAITING_REMINT`
 * (sherlo-tester, e2e/__tests__/push-road-placeholders.test.ts) carry a masked
 * token their own masker cannot produce, so no honest render can ever match
 * them; they are not scripted here and must not be.
 *
 * AMBIENT IS DECLARED, NEVER DEFAULTED - see ./dryRun.transcripts for the rule.
 */
import { Platform } from '@sherlo/api-types';
import type { Config, EasUpdateData, ValidatedBinariesInfo } from '../../types';
import type { GitInfo } from '../../helpers/getGitInfo';
import type { BaseFingerprintResult, GateMetadataInput } from '../../helpers/fingerprint';
import type { TranscriptGrounding } from './dryRun.transcripts';

/**
 * What the module-manifest pass found and managed to do.
 *
 * Only reached when the provenance guard vouches for the tree, which is itself
 * decided by the scripted `gitInfo` - so a scenario cannot ask for the manifest
 * block while also describing a dirty tree.
 */
export type ScriptedManifestPass = {
  /** Platforms whose bundling pass produced a manifest. Others warn and continue. */
  produced: Platform[];
  /** Platforms the backend returned an upload slot for. */
  slotsFor: Platform[];
  /** Present -> the slot request itself threw, with this message. */
  slotRequestError?: string;
  /** Platforms whose manifest PUT failed, with the message it failed with. */
  uploadErrors?: Partial<Record<Platform, string>>;
};

/** Everything a push transcript is a function of. */
export type PushTranscriptState = {
  /** The devices the config asks for - the run header counts these itself. */
  devices: Config['devices'];
  /** What `getValidatedBinariesInfoAndNextBuildIndex` answered. */
  binariesInfo: ValidatedBinariesInfo;
  nextBuildIndex: number;
  /**
   * Per platform, the size string `getSizeInMB` derived from the binary. Needed
   * for every platform whose `binariesInfo` entry carries an upload `url`; a
   * platform with no url is REUSED and prints its cached build instead.
   */
  binarySizesMb: Partial<Record<Platform, string>>;
  /** Present -> the `🔄 EAS Update` block is printed, from these values. */
  easUpdateData?: EasUpdateData;
  /** The repo the push was made from. Drives the manifest provenance guard. */
  gitInfo: GitInfo;
  /** What the base-fingerprint compute answered. `hash: null` -> the else-branch warning. */
  fingerprint: BaseFingerprintResult;
  /**
   * Per platform, the metadata `extractGateMetadata` would have read out of the
   * binary. The SHIPPED `checkStageable` judges it, so the not-stageable reason
   * a transcript prints is the product's sentence, never this file's.
   */
  gateMetadata: Partial<Record<Platform, GateMetadataInput>>;
  manifest: ScriptedManifestPass;
  /**
   * The instant the push happened, as an ISO string. The ONE wall-clock read
   * this transcript has - a reuse line's "N minutes ago" is measured from here
   * against the reused build's `buildCreatedAt`, so both are scripted and the
   * phrase reads the same next month as it does today.
   */
  now: string;
  /** The build the backend opened, and the ids its URL is built from. */
  buildIndex: number;
  projectIndex: number;
  /** Exactly `TEAM_ID_LENGTH` characters - the token layout `getTokenParts` slices. */
  teamId: string;
};

export type PushTranscriptScenario = {
  description: string;
  groundedBy: TranscriptGrounding;
  ambient: { skipIntro: boolean };
  capture: 'stdout' | 'stdout+stderr';
  /** The committed fixture this scenario must render byte-identically. */
  fixture: string;
  state: PushTranscriptState;
};

/* ========================================================================== */

const APP = 'e2e/suites/app';
const SNAPSHOTS = 'e2e/suites/snapshots';

/** The instant every scenario is pushed at. Scripted, so "N minutes ago" never drifts. */
const PUSHED_AT = '2026-08-18T09:07:00.000Z';

/** Seven minutes before the push - a reuse line reads "7 minutes ago" from these two. */
const REUSED_BUILD_CREATED_AT = '2026-08-18T09:00:00.000Z';

/**
 * The SDK version validation lifted off the binaries. It goes to `openBuild`
 * and is never printed, so no transcript byte is a function of it.
 */
const SCENARIO_SDK_VERSION = '2.0.0';

const ANDROID_DEVICE: Config['devices'][number] = {
  id: 'pixel.4.xl',
  osVersion: '13',
  theme: 'light',
  locale: 'en_US',
  fontScale: '1',
};

const IOS_DEVICE: Config['devices'][number] = {
  id: 'iphone.14',
  osVersion: '16.4',
  theme: 'light',
  locale: 'en_US',
  fontScale: '1',
};

/**
 * The gate metadata a DEBUG build carries: no embedded JS bundle. That single
 * field is what makes `checkStageable` refuse, and what makes almost every
 * fixture in this family carry the "Debug builds without an embedded JS bundle
 * cannot be staged" line - once per platform, since each binary is judged alone.
 */
const DEBUG_BUILD_METADATA: GateMetadataInput = {
  derivedFrom: 'binary',
  hasEmbeddedBundle: false,
  expoUpdatesEnabled: false,
};

const FINGERPRINT_OK: BaseFingerprintResult = {
  hash: 'scenario-base-fingerprint',
  nativeFingerprint: 'scenario-native-fingerprint',
};

const PROJECT_INDEX = 7;
const TEAM_ID = 'tm000001';

/** The five values thirty-one committed push fixtures actually differ in. */
type PushDelta = {
  /** Which fixture this scenario answers for, relative to the sherlo-tester repo. */
  fixture: string;
  /** What the transcript is showing, in one sentence. */
  description: string;
  /** The `Test N` in the run header, and the build the backend opened. */
  testNumber: number;
  /** The devices the config asks for. Defaults to one Android. */
  devices?: Config['devices'];
  /**
   * Present -> every binary is REUSED from this earlier test, so no upload
   * happens. Absent -> every binary is uploaded fresh.
   */
  reusedFromTest?: number;
  /**
   * `true` -> the working tree was dirty, the provenance guard refuses, and the
   * whole module-manifest block is replaced by one line saying why.
   */
  dirtyTree?: boolean;
  /** The branch the EAS update was published from. */
  easBranch: string;
};

/**
 * Assemble one scenario's full wire state from its delta.
 *
 * Every field it fills in is a value the real push path reads; nothing here is a
 * shortcut around a decision. In particular the manifest pass is derived from
 * `dirtyTree` in the same direction the CLI derives it - a clean tree produces
 * and uploads a manifest for every platform under test, a dirty one produces
 * none because the shipped guard never lets the pass start.
 */
function pushScenario(delta: PushDelta): PushTranscriptScenario {
  const devices = delta.devices ?? [ANDROID_DEVICE];
  const platforms: Platform[] = devices.some((d) => d.id === IOS_DEVICE.id)
    ? ['android', 'ios']
    : ['android'];

  const binariesInfo: ValidatedBinariesInfo = { sdkVersion: SCENARIO_SDK_VERSION };
  const binarySizesMb: Partial<Record<Platform, string>> = {};
  const gateMetadata: Partial<Record<Platform, GateMetadataInput>> = {};

  for (const platform of platforms) {
    const shared = {
      hash: `${platform}-binary-hash`,
      buildType: 'development' as const,
      fileName: platform === 'android' ? 'app-debug.apk' : 'app.tar.gz',
      s3Key: `builds/${platform}/app`,
    };

    binariesInfo[platform] =
      delta.reusedFromTest === undefined
        ? { ...shared, url: `https://s3.example.invalid/upload/${platform}` }
        : { ...shared, buildIndex: delta.reusedFromTest, buildCreatedAt: REUSED_BUILD_CREATED_AT };

    if (delta.reusedFromTest === undefined) {
      binarySizesMb[platform] = platform === 'android' ? '41.2' : '58.7';
    }
    gateMetadata[platform] = DEBUG_BUILD_METADATA;
  }

  const gitInfo: GitInfo = {
    branchName: delta.easBranch,
    commitHash: '4f2b8c1d9e0a3b5c7d8e9f0a1b2c3d4e5f607182',
    commitName: 'chore: the commit this scenario was grounded on',
    isDirty: Boolean(delta.dirtyTree),
  };

  return {
    description: delta.description,
    // Every value above was read off the fixture this scenario answers for: it
    // is a reconstruction of a real run, not yet re-grounded against the wire.
    groundedBy: { kind: 'derived', fromFixture: delta.fixture },
    ambient: { skipIntro: false },
    capture: 'stdout',
    fixture: delta.fixture,
    state: {
      devices,
      binariesInfo,
      nextBuildIndex: delta.testNumber,
      binarySizesMb,
      easUpdateData: {
        branch: delta.easBranch,
        message: '"tester update"',
        updateUrls: {},
        slug: 'tester-app',
        author: 'github-actions (robot)',
        timeAgo: '2 minutes ago',
      } satisfies EasUpdateData,
      gitInfo,
      fingerprint: FINGERPRINT_OK,
      gateMetadata,
      manifest: delta.dirtyTree
        ? { produced: [], slotsFor: [] }
        : { produced: platforms, slotsFor: platforms },
      now: PUSHED_AT,
      buildIndex: delta.testNumber,
      projectIndex: PROJECT_INDEX,
      teamId: TEAM_ID,
    },
  };
}

/* ========================================================================== */

const DELTAS: Record<string, PushDelta> = {
  /* --- the app suites: one Android, a fresh upload, an EAS update ---------- */

  'push-app-project-build-list': {
    fixture: `${APP}/project/03-project-build-list.spec.ts-snapshots/build-list-push-output-Project-Build-List-darwin.txt`,
    description: 'A first push whose working tree was dirty, so no module manifest is produced.',
    testNumber: 1,
    dirtyTree: true,
    easBranch: 'e2e-app-build-list',
  },
  'push-app-collaboration': {
    fixture: `${APP}/test/collaboration/00-setup.spec.ts-snapshots/collaboration-build-push-output-Collaboration-darwin.txt`,
    description: 'A first push on a dirty tree, seeding the collaboration suite.',
    testNumber: 1,
    dirtyTree: true,
    easBranch: 'e2e-app-test-collaboration',
  },
  'push-app-comments': {
    fixture: `${APP}/test/comments/00-setup.spec.ts-snapshots/comments-own-build-pushed-Comments-darwin.txt`,
    description:
      'THE FULL SPINE: fresh upload, EAS block, staging refusal, and the module-manifest block a clean tree earns.',
    testNumber: 1,
    easBranch: 'e2e-app-test-comments',
  },
  'push-app-keyboard-nav': {
    fixture: `${APP}/test/keyboard-nav/00-setup.spec.ts-snapshots/keyboard-nav-own-build-pushed-Keyboard-Navigation-darwin.txt`,
    description: 'The full spine again, seeding the keyboard-navigation suite.',
    testNumber: 1,
    easBranch: 'e2e-app-test-keyboard-nav',
  },
  'push-app-modals': {
    fixture: `${APP}/test/modals/00-setup.spec.ts-snapshots/modals-own-build-pushed-Modals-darwin.txt`,
    description: 'The full spine again, seeding the modals suite.',
    testNumber: 1,
    easBranch: 'e2e-app-test-modals',
  },
  'push-app-review-prologue': {
    fixture: `${APP}/test/prologue/00-setup.spec.ts-snapshots/frozen-build-push-output-Build-Review-Prologue-darwin.txt`,
    description:
      'TWO DEVICES ON ONE PLATFORM. The only fixture where the run header pluralises ("2 devices") while the platform breakdown stays a single entry - so it is what proves the count and the breakdown are computed separately.',
    testNumber: 1,
    devices: [ANDROID_DEVICE, ANDROID_DEVICE],
    easBranch: 'e2e-app-test-review-frozen',
  },
  'push-app-review': {
    fixture: `${APP}/test/review/00-setup.spec.ts-snapshots/review-push-output-Build-Review-darwin.txt`,
    description: 'The full spine again, seeding the build-review suite.',
    testNumber: 1,
    easBranch: 'e2e-app-test-review',
  },
  'push-app-status-filtering': {
    fixture: `${APP}/test/status-filtering/00-setup.spec.ts-snapshots/status-filters-own-build-pushed-Status-Filters-darwin.txt`,
    description: 'The full spine again, seeding the status-filters suite.',
    testNumber: 1,
    easBranch: 'e2e-app-test-status-filters',
  },

  /* --- the snapshot suites ------------------------------------------------ */

  'push-ancestry-accept-once-baseline': {
    fixture: `${SNAPSHOTS}/ancestry-accept-once/00-setup.spec.ts-snapshots/accept-once-baseline-push-Ancestry-Accept-Once-darwin.txt`,
    description: 'The trunk baseline of the accept-once story: a first push with a manifest.',
    testNumber: 1,
    easBranch: 'e2e-ancestry-accept-once-main',
  },
  'push-ancestry-accept-once-branch': {
    fixture: `${SNAPSHOTS}/ancestry-accept-once/00-setup.spec.ts-snapshots/accept-once-branch-push-Ancestry-Accept-Once-darwin.txt`,
    description:
      'THE REUSE BRANCH. The same binary pushed from a feature branch: the backend recognises it and hands back no upload slot, so the platform block becomes one "reusing unchanged build" line naming the test it came from. The masker deliberately does NOT fold upload and reuse together - they are different things the CLI did.',
    testNumber: 2,
    reusedFromTest: 1,
    easBranch: 'e2e-ancestry-accept-once-feature',
  },
  'push-ancestry-accept-once-post-merge': {
    fixture: `${SNAPSHOTS}/ancestry-accept-once/01-accept-once-on-main.spec.ts-snapshots/accept-once-post-merge-push-Ancestry-Accept-Once-darwin.txt`,
    description: 'The post-merge push back on trunk, still reusing the original binary.',
    testNumber: 3,
    reusedFromTest: 1,
    easBranch: 'e2e-ancestry-accept-once-main',
  },
  'push-ancestry-baseline-trunk': {
    fixture: `${SNAPSHOTS}/ancestry-baseline/02-three-builds-across-a-branch-point.spec.ts-snapshots/trunk-baseline-push-Ancestry-Baseline-darwin.txt`,
    description: 'The first of three builds across a branch point: the trunk baseline.',
    testNumber: 1,
    easBranch: 'e2e-ancestry-baseline-main',
  },
  'push-ancestry-baseline-trunk-advance': {
    fixture: `${SNAPSHOTS}/ancestry-baseline/02-three-builds-across-a-branch-point.spec.ts-snapshots/trunk-advance-push-Ancestry-Baseline-darwin.txt`,
    description: 'Trunk advances: a reuse push at Test 2.',
    testNumber: 2,
    reusedFromTest: 1,
    easBranch: 'e2e-ancestry-baseline-main',
  },
  'push-ancestry-baseline-branch': {
    fixture: `${SNAPSHOTS}/ancestry-baseline/02-three-builds-across-a-branch-point.spec.ts-snapshots/branch-build-push-Ancestry-Baseline-darwin.txt`,
    description: 'The branch build, third in the ancestry story and still a reuse.',
    testNumber: 3,
    reusedFromTest: 1,
    easBranch: 'e2e-ancestry-baseline-feature',
  },
  'push-auto-titled-params': {
    fixture: `${SNAPSHOTS}/auto-titled-params/00-setup.spec.ts-snapshots/auto-titled-push-Auto-Titled-Story-Params-darwin.txt`,
    description: 'A first push on a dirty tree, seeding the auto-titled story-params suite.',
    testNumber: 1,
    dirtyTree: true,
    easBranch: 'e2e-auto-titled-params',
  },
  'push-branch-switcher-main': {
    fixture: `${SNAPSHOTS}/branch-switcher/00-setup.spec.ts-snapshots/branch-switcher-main-branch-push-Branch-Switcher-darwin.txt`,
    description: 'The main-branch build of the branch-switcher story.',
    testNumber: 1,
    easBranch: 'e2e-branch-switcher-main',
  },
  'push-branch-switcher-feature': {
    fixture: `${SNAPSHOTS}/branch-switcher/00-setup.spec.ts-snapshots/branch-switcher-feature-branch-push-Branch-Switcher-darwin.txt`,
    description: 'The feature-branch build of the branch-switcher story, reusing the main binary.',
    testNumber: 2,
    reusedFromTest: 1,
    easBranch: 'e2e-branch-switcher-feature',
  },
  'push-comparison-first': {
    fixture: `${SNAPSHOTS}/comparison/00-setup.spec.ts-snapshots/comparison-first-push-Build-Comparison-darwin.txt`,
    description: 'The first push of a two-build comparison.',
    testNumber: 1,
    easBranch: 'e2e-comparison',
  },
  'push-comparison-unchanged': {
    fixture: `${SNAPSHOTS}/comparison/00-setup.spec.ts-snapshots/comparison-unchanged-push-Build-Comparison-darwin.txt`,
    description: 'The unchanged second push of the comparison: a reuse on a clean tree.',
    testNumber: 2,
    reusedFromTest: 1,
    easBranch: 'e2e-comparison',
  },
  'push-comparison-changed': {
    fixture: `${SNAPSHOTS}/comparison/00-setup.spec.ts-snapshots/comparison-changed-push-Build-Comparison-darwin.txt`,
    description:
      'The changed third push: the JS edit that makes the comparison interesting also dirties the tree, so this is a reuse WITHOUT a manifest.',
    testNumber: 3,
    reusedFromTest: 1,
    dirtyTree: true,
    easBranch: 'e2e-comparison',
  },
  'push-dirty-badge-clean': {
    fixture: `${SNAPSHOTS}/dirty-badge-baseline-history/00-setup.spec.ts-snapshots/dirty-badge-warned-clean-push-Dirty-Badge-Baseline-History-darwin.txt`,
    description: 'The clean push the dirty-badge story compares its dirty one against.',
    testNumber: 1,
    easBranch: 'e2e-dirty-badge-gate-on',
  },
  'push-dirty-badge-edited': {
    fixture: `${SNAPSHOTS}/dirty-badge-baseline-history/00-setup.spec.ts-snapshots/dirty-badge-warned-edited-push-Dirty-Badge-Baseline-History-darwin.txt`,
    description:
      'THE DIRTY-TREE BRANCH, named. The edit that earns the dirty badge is also what makes `assessManifestProvenance` refuse to vouch: the whole manifest block is replaced by one line saying why, and the run degrades to a full capture rather than to a wrong partial one.',
    testNumber: 2,
    reusedFromTest: 1,
    dirtyTree: true,
    easBranch: 'e2e-dirty-badge-gate-on',
  },
  'push-params-baseline': {
    fixture: `${SNAPSHOTS}/params/00-setup.spec.ts-snapshots/params-baseline-push-Story-Parameters-darwin.txt`,
    description: 'The story-parameters baseline push, on a dirty tree.',
    testNumber: 1,
    dirtyTree: true,
    easBranch: 'e2e-snapshots-params',
  },
  'push-params-second': {
    fixture: `${SNAPSHOTS}/params/00-setup.spec.ts-snapshots/params-second-build-push-Story-Parameters-darwin.txt`,
    description: 'The story-parameters second build: a reuse on a dirty tree.',
    testNumber: 2,
    reusedFromTest: 1,
    dirtyTree: true,
    easBranch: 'e2e-snapshots-params',
  },
  'push-regression-matrix': {
    fixture: `${SNAPSHOTS}/regression/00-setup.spec.ts-snapshots/regression-matrix-push-output-Regression-Matrix-darwin.txt`,
    description:
      'TWO PLATFORMS. Android and iOS each get their own binary block, and each binary is judged for staging separately - so this is the one fixture in the tree that shows the refusal printed TWICE. Its tree is dirty, so no manifest follows.',
    testNumber: 1,
    devices: [ANDROID_DEVICE, IOS_DEVICE],
    dirtyTree: true,
    easBranch: 'e2e-snapshots-regression',
  },
  'push-scroll-baseline': {
    fixture: `${SNAPSHOTS}/scroll/00-setup.spec.ts-snapshots/scroll-baseline-push-Scroll-Capture-darwin.txt`,
    description: 'The scroll-capture baseline push, on a dirty tree.',
    testNumber: 1,
    dirtyTree: true,
    easBranch: 'e2e-scroll-cap',
  },
  'push-scroll-second': {
    fixture: `${SNAPSHOTS}/scroll/00-setup.spec.ts-snapshots/scroll-second-build-push-Scroll-Capture-darwin.txt`,
    description: 'The scroll-capture second build: a reuse on a dirty tree.',
    testNumber: 2,
    reusedFromTest: 1,
    dirtyTree: true,
    easBranch: 'e2e-scroll-cap',
  },
  'push-stability-baseline': {
    fixture: `${SNAPSHOTS}/stability/00-setup.spec.ts-snapshots/stability-baseline-push-Snapshot-Stability-darwin.txt`,
    description: 'The snapshot-stability baseline push, on a dirty tree.',
    testNumber: 1,
    dirtyTree: true,
    easBranch: 'e2e-snapshots-stability',
  },
  'push-stability-repeat': {
    fixture: `${SNAPSHOTS}/stability/00-setup.spec.ts-snapshots/stability-repeat-push-Snapshot-Stability-darwin.txt`,
    description: 'The snapshot-stability repeat push: the same tree pushed twice.',
    testNumber: 2,
    reusedFromTest: 1,
    dirtyTree: true,
    easBranch: 'e2e-snapshots-stability',
  },
  'push-statuses-first': {
    fixture: `${SNAPSHOTS}/statuses/00-setup.spec.ts-snapshots/special-status-first-push-Special-Statuses-darwin.txt`,
    description: 'The first push of the special-statuses story, on a dirty tree.',
    testNumber: 1,
    dirtyTree: true,
    easBranch: 'e2e-app-test-special-statuses',
  },
  'push-statuses-second': {
    fixture: `${SNAPSHOTS}/statuses/00-setup.spec.ts-snapshots/special-status-second-push-Special-Statuses-darwin.txt`,
    description: 'The second push of the special-statuses story: a reuse on a dirty tree.',
    testNumber: 2,
    reusedFromTest: 1,
    dirtyTree: true,
    easBranch: 'e2e-app-test-special-statuses',
  },
};

export const PUSH_TRANSCRIPTS: Record<string, PushTranscriptScenario> = Object.fromEntries(
  Object.entries(DELTAS).map(([id, delta]) => [id, pushScenario(delta)])
);

export const PUSH_TRANSCRIPT_IDS = Object.keys(PUSH_TRANSCRIPTS);
