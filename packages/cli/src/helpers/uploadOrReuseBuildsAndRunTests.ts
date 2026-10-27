import { BaseSourceList, Platform } from '@sherlo/api-types';
import logWarning from './logWarning';
import { PLATFORM_LABEL, TEST_COMMAND } from '../constants';
import { CommandParams } from '../types';
import {
  realFreshBundleEffects,
  uploadFreshBundles,
  type FreshBundleEffects,
} from './uploadFreshBundles';
import { closeTheRun } from '../commands/test/closeTheRun';
import {
  collectModuleManifests,
  countBundleScenes,
  countBundleStories,
  countInBundles,
} from '../commands/test/readModuleManifest';
import { type AppBuildAccount, pushFactsOf } from '../commands/test/appBuild/pushFacts';
import { printTestStarted } from '../commands/test/startTheTest';
import { buildSettingsDigestsOf, readBuildSettings } from '../commands/test/appBuild/buildSettings';
import { joinTheRun } from '../commands/test/appBuild/joinTheRun';
import type { PlatformRow } from '../render/runRows';
import { applyBundleToPlatformConfig } from '../commands/test/uploadBundles';
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
   * `ValidatedBinariesInfo`, not `BinariesInfo`: the `openBuild` call below
   * reads `binariesInfo.sdkVersion`, which only the VALIDATED shape carries.
   */
  resolveBinaries: () => Promise<{
    binariesInfo: ValidatedBinariesInfo;
    nextBuildIndex: number;
  }>;
  resolveGitInfo: () => Promise<GitInfo>;
  /** Opens the test, or - for one job of a split CI run - joins the one its CI run shares. */
  openBuild: (
    input: Record<string, unknown>
  ) => Promise<OpenBuildAnswer | Awaited<ReturnType<typeof joinTheRun>>>;
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
  fingerprints,
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
  /**
   * Each platform's base fingerprint, TAKEN BEFORE ANYTHING WAS BUILT - the one the staged gate was
   * asked with. Never taken again here: a build writes into the project (pods, prebuilt frameworks
   * inside `node_modules`), so a fingerprint taken after it reads files a clean install of the same
   * lockfile lacks, and a stored base no later JavaScript-only push could match.
   */
  fingerprints: BaseFingerprints;
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
  // The base fingerprint is the caller's, taken once before anything was built
  // or could load the Expo app config (SHERLO-1756; ../commands/test/stagedRun).
  // Each platform's base fingerprint AND the `nativeFingerprint` wire value are
  // sourced from that single result. `nativeFingerprint` covers both platforms,
  // so every platform's result carries the same one, or undefined when the
  // compute failed (fail-soft).
  // ------------------------------------------------------------------
  const nativeFingerprint = fingerprints.android.nativeFingerprint;

  // The platforms this push uploads an app build for. Each is registered as the
  // native base below and rendered with a fresh bundle.
  const uploadedPlatforms: Platform[] = [];
  if (binariesInfo.android && appBuildPaths.android) uploadedPlatforms.push('android');
  if (binariesInfo.ios && appBuildPaths.ios) uploadedPlatforms.push('ios');

  /** A platform whose base fingerprint could not be computed - the run cannot name its base. */
  const platformWithoutFingerprint = uploadedPlatforms.find(
    (platform) => !fingerprints[platform].hash
  );
  /**
   * Every bundled platform's own base, a stored one's too: an uploaded platform's app build is
   * registered under its base, and a stored platform's is found by it.
   */
  const bundledBaseFingerprints = baseFingerprintsOf(fingerprints, platformsToBundle);
  /** Each registered platform's source list, stored with its base. */
  const sourceLists: Partial<Record<Platform, BaseSourceList>> = {};
  /** Each bundled platform's gate facts: an uploaded one's read from its binary, a stored one's from its fresh bundle. */
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
    for (const platform of uploadedPlatforms) {
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
  const reasons = uploadedPlatforms
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
    platformsOnStoredBuild,
    bundleDir: commandParams.bundleDir,
    buildSettings: readBuildSettings(commandParams),
    // Every bundled platform's own base, a stored one's too: a supplied bundle is checked
    // against the base of the platform it is for.
    baseFingerprints: bundledBaseFingerprints,
    projectIndex,
    teamId,
    effects: io.freshBundle,
  });
  const platformsWithBundles = Object.keys(freshBundles) as Platform[];

  // A stored platform's gate facts come from its fresh bundle: the service checks that bundle fits
  // the stored app build it is spliced into, as on the staged road.
  for (const platform of platformsOnStoredBuild) {
    const storedBuildGateMetadata = freshBundles[platform]?.storedBuildGateMetadata;
    if (storedBuildGateMetadata) gateMetadata[platform] = storedBuildGateMetadata;
  }

  await uploadOrPrintBinaryReuse({
    binariesInfo,
    projectRoot: commandParams.projectRoot,
    android: appBuildPaths.android,
    ios: appBuildPaths.ios,
    uploadEffects: io.binaryUpload,
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
      storiesInBundle: countInBundles(freshBundles, platformsWithBundles, countBundleStories),
      scenesInBundle: countInBundles(freshBundles, platformsWithBundles, countBundleScenes),
      env: process.env,
      runIdFlag,
    }),
    // Each bundled platform's own base and build settings digest, so a native change on one
    // platform leaves the other's stored app build in use; each bundled platform's gate metadata,
    // an uploaded one's read from its binary and a stored one's from its fresh bundle; and the
    // source list of the uploaded platforms only, the ones that register a base.
    ...(platformWithoutFingerprint === undefined
      ? {
          baseFingerprints: bundledBaseFingerprints,
          buildSettingsDigests: buildSettingsDigestsOf(
            readBuildSettings(commandParams),
            platformsToBundle
          ),
          gateMetadata,
          sourceLists,
        }
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
  const openedAlone = 'waitingFor' in opened ? undefined : opened;
  const serverBypassed =
    openedAlone !== undefined && isServerBypassed(openedAlone.build.diffScopeInfo);

  // The step that started the test, with how many stories it captures, read off the openBuild
  // answer - the same line the staged road prints - then the run's one ending.
  if (openedAlone) {
    printTestStarted({
      openBuildReturn: openedAlone,
      moduleManifests: collectModuleManifests(freshBundles, platformsWithBundles),
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
    hasCiToken: openedAlone?.hasCiToken,
  });

  return { url };
}

export default uploadOrReuseBuildsAndRunTests;

/* ========================================================================== */

/** The platforms the run's config names a device for - every platform the started test runs on. */
function platformsInTheRun(buildRunConfig: ReturnType<typeof getBuildRunConfig>): Platform[] {
  return (['android', 'ios'] as const).filter((platform) => buildRunConfig[platform]);
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
