import { BaseSourceList, Platform } from '@sherlo/api-types';
import logWarning from './logWarning';
import { PLATFORM_LABEL, TEST_COMMAND } from '../constants';
import { CommandParams } from '../types';
import {
  realFreshBundleEffects,
  uploadFreshBundles,
  type FreshBundleEffects,
  type UploadedFreshBundle,
} from './uploadFreshBundles';
import { closeTheRun } from '../commands/test/closeTheRun';
import {
  countBundleStories,
  type ValidatedModuleManifest,
} from '../commands/test/readModuleManifest';
import { type AppBuildAccount, pushFactsOf } from '../commands/test/appBuild/pushFacts';
import { printTestStarted } from '../commands/test/stagedRun';
import { readBuildSettings } from '../commands/test/appBuild/buildSettings';
import { joinTheRun } from '../commands/test/appBuild/joinTheRun';
import type { PlatformRow } from '../render/runRows';
import { applyBundleToPlatformConfig } from '../commands/test/uploadBundles';
import { resolveBaseFingerprintForSuppliedBundle } from '../commands/test/recordedBaseFingerprint';
import type { BinaryUploadEffects } from './uploadOrPrintBinaryReuse/uploadBuild';
import type { BaseRegistrationEffects } from './fingerprint/registerBase';
import type { BaseFingerprints } from './fingerprint';
import { baseFingerprintsOf } from './fingerprint/baseFingerprintsOf';
import type { GitInfo } from './getGitInfo';
import type { ValidatedBinariesInfo } from '../types';
import getAppBuildUrl from './getAppBuildUrl';
import getBuildRunConfig from './getBuildRunConfig';
import { getGitInfo } from '../seams/surroundings';
import { nativeBuild } from '../seams/nativeBuild';
import {
  serverCalls,
  type JoinBuildAnswer,
  type OpenBuildAnswer,
  type OpenBuildRequest,
  type PushFacts,
} from '../seams/serverCalls';
import getValidatedBinariesInfoAndNextBuildIndex from './getValidatedBinariesInfoAndNextBuildIndex';
import handleClientError from './handleClientError';
import reporting from './reporting';
import throwError from './throwError';
import { registerBase, type GateMetadataInput } from './fingerprint';
import uploadOrPrintBinaryReuse from './uploadOrPrintBinaryReuse';
import { isServerBypassed } from './waitForBuildResult';

/**
 * EVERY EFFECT THE PUSH SPINE PERFORMS, AS PARAMETERS - which is what lets an
 * expectation producer run THIS function rather than a re-implementation of it.
 *
 * The spine's transcript is emitted from here and from the shipped helpers it
 * calls, interleaved with these awaits: the fingerprint warnings from inside
 * `registerBase`, the bundling from inside `uploadFreshBundles`, each platform's
 * upload, then the started test and the run's ending after `openBuild` answers.
 * A producer that re-implemented that order could drift from it silently;
 * supplying the effects means the order, the branching and every literal come
 * from the shipped code, unforked.
 *
 * WHAT IS *NOT* HERE IS THE POINT. There is no substitute for a formatter, a
 * print site, a segment or a branch - only for the things that touch the
 * network, the filesystem and the clock.
 */
export type PushEffects = {
  /**
   * The instant a reuse line's "N minutes ago" is measured against - the ONE
   * wall-clock read on this transcript's path, and an effect for exactly the
   * reason the network ones are: a fixed scripted state that read the real clock
   * would render different bytes tomorrow.
   */
  now: () => Date;
  /**
   * `ValidatedBinariesInfo`, not `BinariesInfo`: the `openBuild` call below
   * reads `binariesInfo.sdkVersion`, which only the VALIDATED shape carries.
   */
  resolveBinaries: () => Promise<{
    binariesInfo: ValidatedBinariesInfo;
    nextBuildIndex: number;
  }>;
  resolveGitInfo: () => Promise<GitInfo>;
  computeFingerprint: () => Promise<BaseFingerprints>;
  /** Opens the test, or - for one job of a split CI run - joins the one its CI run shares. */
  openBuild: (input: Record<string, unknown>) => Promise<OpenBuildAnswer | JoinBuildAnswer>;
  binaryUpload: BinaryUploadEffects;
  baseRegistration: BaseRegistrationEffects;
  /** The fresh bundle spliced into every binary this run renders. */
  freshBundle: FreshBundleEffects;
};

/** One job of a split CI run: the key its CI run's jobs share, and the platform this job brings. */
export type SplitJob = { joinKey: string; platform: Platform };

/**
 * The standard road of `sherlo test`: upload (or reuse) the app builds this run made, register
 * them as the native base, splice a freshly built bundle in and open the test.
 *
 * Two shapes of the same push are the spine's too, so nothing calling it copies its defaults:
 *
 *   - a MIXED run (`platformsOnStoredBuild`): a platform whose stored app build still matches gets
 *     its fresh bundle spliced into that stored app build, as on the staged road, in the same test;
 *   - one job of a SPLIT CI run (`splitJob`): the test is joined, not opened (joinTheRun).
 */
async function uploadOrReuseBuildsAndRunTests({
  commandParams,
  appBuildPaths,
  platformsOnStoredBuild = [],
  splitJob,
  effects,
  platformRows,
  appBuilds = {},
  runIdFlag,
}: {
  commandParams: CommandParams;
  /** The app builds this push uploads, per platform: the ones this run just built. */
  appBuildPaths: Partial<Record<Platform, string>>;
  /** The platforms that keep the app build Sherlo stores, and take only a fresh bundle. */
  platformsOnStoredBuild?: Platform[];
  /** Set for one job of a split CI run, which joins the test its CI run shares. */
  splitJob?: SplitJob;
  effects?: PushEffects;
  /** What became of each platform's app build before the push: the rows above the test's row. */
  platformRows: PlatformRow[];
  /** How each of those app builds was made, and why a new one: what the push reports about itself. */
  appBuilds?: Partial<Record<Platform, AppBuildAccount>>;
  /** `--run-id`, which names the CI run the push reports when the CI service does not. */
  runIdFlag?: string;
}): Promise<{ url: string }> {
  // The credential and its project were resolved before any request (./getValidatedCommandParams).
  const { token, projectIndex, teamId } = commandParams.credential;

  const command = TEST_COMMAND;

  /** Every platform this push renders a fresh bundle for: the built ones, then the stored ones. */
  const platformsToBundle: Platform[] = [
    ...platformsWithAppBuilds(appBuildPaths),
    ...platformsOnStoredBuild,
  ];

  // THE SEAMS IN FORCE, not the real machine by name: a posed run installs its own machine and
  // server (../seams/nativeBuild, ../seams/serverCalls) and this spine never learns which it got.
  const machine = nativeBuild();
  const io: PushEffects = effects ?? {
    now: () => machine.now(),
    resolveBinaries: () =>
      getValidatedBinariesInfoAndNextBuildIndex({
        token,
        command,
        commandParams,
        appBuildPaths,
        projectIndex,
        teamId,
      }),
    resolveGitInfo: () =>
      getGitInfo(commandParams.projectRoot, { branchOverride: commandParams.gitBranch }),
    // A run that supplies its bundle takes the fingerprint the bundle recorded
    // when this tree's native inputs still match - the machine that accepts a
    // bundle has no install to compute one with. See ./recordedBaseFingerprint.
    computeFingerprint: () =>
      commandParams.bundleDir !== undefined
        ? resolveBaseFingerprintForSuppliedBundle({
            bundleDir: commandParams.bundleDir,
            projectRoot: commandParams.projectRoot,
            platforms: platformsToBundle,
            command,
          })
        : machine.computeFingerprint(commandParams.projectRoot, command),
    openBuild: ({ pushFacts, ...input }) =>
      splitJob
        ? joinTheRun({
            token,
            joinKey: splitJob.joinKey,
            platform: splitJob.platform,
            request: input as OpenBuildRequest,
            // The job reports its own platform's facts; the CI run is already its join key.
            pushFacts: (pushFacts as PushFacts).platforms[splitJob.platform],
            platformRows,
            testDevices: commandParams.testDevices,
          })
        : serverCalls()
            .openBuild({ token, pushFacts, ...input } as never)
            .catch((error) => handleClientError(error, token)),
    binaryUpload: {
      readBinary: (buildPath, platform, projectRoot) =>
        machine.readBinaryForUpload(buildPath, platform, projectRoot),
      putBinary: (uploadUrl, data) => machine.putBinary(uploadUrl, data),
    },
    baseRegistration: {
      extractGateMetadataFor: (params) => machine.extractGateMetadataFor(params),
    },
    freshBundle: realFreshBundleEffects(token),
  };

  const { binariesInfo } = await io.resolveBinaries();

  const gitInfo = await io.resolveGitInfo();

  // ------------------------------------------------------------------
  // Compute the base fingerprint FIRST - before any other work that could load
  // the Expo app config (SHERLO-1756). Loading the app config mutates
  // process.env as a dotenv-class side effect; if that ran before the sanitized
  // Layer-1 compute it would pollute the env that compute snapshots, producing a
  // base fingerprint no probe (the staged road, which never loads the
  // config first) could ever match.
  //
  // This is the ONLY fingerprint computation on this path: each platform's
  // base fingerprint AND the `nativeFingerprint` wire value are sourced from
  // this single result. `nativeFingerprint` covers both platforms, so every
  // platform's result carries the same one, or undefined when the compute fails
  // (fail-soft).
  // ------------------------------------------------------------------
  const fingerprints = await io.computeFingerprint();
  const nativeFingerprint = fingerprints.android.nativeFingerprint;

  // The platforms this push uploads an app build for. Each is registered as the
  // native base below and rendered with a fresh bundle.
  const platforms: Platform[] = [];
  if (binariesInfo.android && appBuildPaths.android) platforms.push('android');
  if (binariesInfo.ios && appBuildPaths.ios) platforms.push('ios');

  /** A platform whose base fingerprint could not be computed - the run cannot name its base. */
  const platformWithoutFingerprint = platforms.find((platform) => !fingerprints[platform].hash);
  /** Each uploaded platform's own base, which its app build is registered under. */
  const baseFingerprints = baseFingerprintsOf(fingerprints, platforms);
  /** Each registered platform's source list, stored with its base. */
  const sourceLists: Partial<Record<Platform, BaseSourceList>> = {};
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};
  /**
   * Per platform, why a fresh bundle cannot be spliced into its binary; absent
   * when it can. A base is registered exactly when the binary loads a plain-JS
   * bundle from the platform-default path (see checkStageable), which is the
   * same fact the runner's splice relies on - so a refused registration is a
   * refused splice, and its reason is the one to show.
   */
  const notSpliceableReasons: Partial<Record<Platform, string>> = {};

  if (platformWithoutFingerprint === undefined) {
    // Extract gate metadata per platform (fail-soft per platform).
    for (const platform of platforms) {
      try {
        const binaryPath = appBuildPaths[platform]!;
        const binaryInfo = binariesInfo[platform]!;

        const result = await registerBase(
          {
            binaryPath,
            platform,
            projectRoot: commandParams.projectRoot,
            bundlePath: defaultEmbeddedBundlePath(platform),
            buildType: binaryInfo.buildType,
            baseFingerprint: fingerprints[platform],
            command,
          },
          io.baseRegistration
        );

        if (result.gateMetadata) {
          gateMetadata[platform] = result.gateMetadata;
        }
        if (result.sourceList) {
          sourceLists[platform] = result.sourceList;
        }
        if (!result.registered) {
          notSpliceableReasons[platform] =
            result.notStageableReason ?? 'the gate metadata could not be read from the binary';
        }
      } catch {
        // Fail-soft: base registration errors are non-fatal.
        notSpliceableReasons[platform] = 'base registration failed';
      }
    }
  } else {
    logWarning({
      message: `Staged uploads unavailable - ${
        fingerprints[platformWithoutFingerprint].debugMessage ?? 'fingerprint computation failed'
      }`,
    });
  }

  // A split job's test names every device of the test, so the platform the other job brings is
  // waited for rather than left out; a platform with no app build here carries the async-upload
  // placeholder, as the stored ones of a mixed run do.
  const buildRunConfig = getBuildRunConfig({
    commandParams,
    binaryS3Keys: {
      android: binariesInfo.android?.s3Key,
      ios: binariesInfo.ios?.s3Key,
    },
    ...(splitJob ? { wholeTest: true } : {}),
  });

  // THE RUN RENDERS A FRESHLY BUILT BUNDLE, OR IT DOES NOT RUN.
  //
  // The runner splices the bundle into the binary at the platform-default
  // bundle path, so a binary that does not load a plain-JS bundle from that
  // path cannot render it, and without a base fingerprint there is no base to
  // name the splice against. Either way the binary's own embedded bundle would
  // render instead - a run this command never performs - so the run is
  // refused, naming every reason at once.
  const reasons = platforms
    .filter((platform) => notSpliceableReasons[platform])
    .map((platform) => `${PLATFORM_LABEL[platform]}: ${notSpliceableReasons[platform]}`);
  if (platformWithoutFingerprint !== undefined) {
    reasons.push(
      `base fingerprint: ${
        fingerprints[platformWithoutFingerprint].debugMessage ?? 'fingerprint computation failed'
      }`
    );
  }
  if (reasons.length > 0) {
    throwError({
      message:
        'This run cannot render a freshly built JS bundle, so it was not started.\n\n' +
        `${reasons.map((reason) => `  - ${reason}`).join('\n')}\n\n` +
        'Every `npx sherlo test` run renders the bundle built from your current project, ' +
        'spliced into the binary you passed. A binary that cannot take it would render ' +
        'the JS it was built with instead, so it is refused rather than tested stale.',
    });
  }

  // The bundles first, then the app builds: a bundle the run refuses (one that holds no stories)
  // stops it before anything is uploaded.
  const freshBundles = await uploadFreshBundles({
    projectRoot: commandParams.projectRoot,
    platforms: platformsToBundle,
    bundleDir: commandParams.bundleDir,
    buildSettings: readBuildSettings(commandParams),
    // Every bundled platform's own base, a stored one's too: a supplied bundle is checked
    // against the base of the platform it is for.
    baseFingerprints: baseFingerprintsOf(fingerprints, platformsToBundle),
    projectIndex,
    teamId,
    effects: io.freshBundle,
  });

  await uploadOrPrintBinaryReuse({
    binariesInfo,
    projectRoot: commandParams.projectRoot,
    android: appBuildPaths.android,
    ios: appBuildPaths.ios,
    uploadEffects: io.binaryUpload,
    now: io.now(),
  });

  // A built platform's bundle is spliced into THIS binary, which keeps its own `s3Key` (set by
  // getBuildRunConfig above); a stored platform's into its stored app build, named by the
  // async-upload placeholder its config carries.
  for (const platform of platformsToBundle) {
    const platformConfig = buildRunConfig[platform];
    const uploaded = freshBundles[platform];
    if (!platformConfig || !uploaded) continue;

    applyBundleToPlatformConfig({
      platformConfig,
      keys: uploaded.keys,
      bundleSizeMb: uploaded.bundleSizeMb,
    });
  }

  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling openBuild API',
    data: { teamId, projectIndex, command },
    level: 'info',
  });

  const opened = await io.openBuild({
    teamId,
    projectIndex,
    binaryHashes: {
      android: binariesInfo.android?.hash,
      ios: binariesInfo.ios?.hash,
    },
    binaryFileNames: {
      android: binariesInfo.android?.fileName,
      ios: binariesInfo.ios?.fileName,
    },
    buildRunConfig,
    gitInfo,
    sdkVersion: binariesInfo.sdkVersion,
    message: commandParams.message,
    nativeFingerprint,
    pushFacts: pushFactsOf({
      appBuilds,
      storiesInBundle: storiesInBundleOf(freshBundles),
      env: process.env,
      runIdFlag,
    }),
    // Each platform's own base, so a native change on one platform leaves the other's stored app
    // build in use, and the source list each base was built from.
    ...(platformWithoutFingerprint === undefined
      ? { baseFingerprints, gateMetadata, sourceLists }
      : {}),
  });

  const buildIndex = opened.build.index;
  // Sentry tags must be strings; buildIndex is a number from the API response.
  reporting.setTag('build_index', String(buildIndex));

  const platform =
    binariesInfo.android && binariesInfo.ios ? 'both' : binariesInfo.android ? 'android' : 'ios';
  reporting.setTag('platform', platform);

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  // A joined run's own step was printed when it joined (../commands/test/appBuild/joinTheRun); its
  // run starts when the last platform is in, so a job whose run still waits has no next step.
  const joined = 'waitingFor' in opened ? opened : undefined;
  const serverBypassed = !joined && isServerBypassed(opened.build.diffScopeInfo);

  // The step that started the test, with how many stories it captures, read off the openBuild
  // answer - the same line the staged road prints - then the run's one ending.
  if (!joined) {
    printTestStarted({
      openBuildReturn: opened,
      moduleManifests: moduleManifestsOf(freshBundles),
      platformsToTest: platformsInTheRun(buildRunConfig),
      devices: commandParams.devices,
      serverBypassed,
      platformRows,
    });
  }

  await closeTheRun({
    commandParams,
    buildIndex,
    url,
    serverBypassed,
    platformRows,
    endsOnNextStep: !joined || joined.waitingFor.length === 0,
    hasCiToken: joined ? undefined : opened.hasCiToken,
  });

  return { url };
}

export default uploadOrReuseBuildsAndRunTests;

/* ========================================================================== */

/** The platforms the run's config names a device for - every platform the started test runs on. */
function platformsInTheRun(buildRunConfig: ReturnType<typeof getBuildRunConfig>): Platform[] {
  return (['android', 'ios'] as const).filter((platform) => buildRunConfig[platform]);
}

/** Each fresh bundle's module map, which the test's row counts the bundle's stories from. */
function moduleManifestsOf(
  freshBundles: Partial<Record<Platform, UploadedFreshBundle>>
): Partial<Record<Platform, ValidatedModuleManifest>> {
  const moduleManifests: Partial<Record<Platform, ValidatedModuleManifest>> = {};
  for (const [platform, freshBundle] of Object.entries(freshBundles) as [
    Platform,
    UploadedFreshBundle
  ][]) {
    if (freshBundle.moduleManifest) moduleManifests[platform] = freshBundle.moduleManifest;
  }
  return moduleManifests;
}

/** How many stories each fresh bundle holds, counted off its module map. */
function storiesInBundleOf(
  freshBundles: Partial<Record<Platform, UploadedFreshBundle>>
): Partial<Record<Platform, number>> {
  return Object.fromEntries(
    Object.entries(moduleManifestsOf(freshBundles)).map(([platform, moduleManifest]) => [
      platform,
      countBundleStories(moduleManifest),
    ])
  );
}

/** The platforms this push uploads an app build for, Android first. */
function platformsWithAppBuilds(appBuildPaths: Partial<Record<Platform, string>>): Platform[] {
  return (['android', 'ios'] as const).filter((platform) => appBuildPaths[platform]);
}

/**
 * Where a React Native binary embeds its JS bundle by default:
 * `assets/index.android.bundle` on Android, `main.jsbundle` on iOS. It is the
 * default set by React Native's Gradle bundle task and `expo export:embed`, and
 * does NOT vary with the JS entry file.
 *
 * This is base-registration metadata, not the bundle a run renders. Base
 * registration probes this path to learn whether the binary embeds a bundle
 * and in what format; the runner later overwrites the same path with the
 * freshly built bundle, which is what actually runs.
 */
function defaultEmbeddedBundlePath(platform: Platform): string {
  if (platform === 'android') {
    return 'assets/index.android.bundle';
  }
  return 'main.jsbundle';
}
