/**
 * WHERE `sherlo test` USED TO STOP, IT BUILDS - the staged gate said a platform needs a new app
 * build, so the tool builds it here and pushes it down the standard road, exactly as if the
 * developer had built it and passed `--android`/`--ios` themselves.
 *
 * Three shapes of the same push:
 *
 *   - every platform needs a build: build them all, then the standard road as it is;
 *   - a MIXED run: one platform needs a build and the other can still take the stored app build
 *     (only JavaScript changed there) - the built one is uploaded, the other gets its fresh bundle
 *     spliced into the stored app build, and both are one run (operator ruling 2026-10-07: build
 *     only the platform that needs it);
 *   - one job of a SPLIT CI run (`--platform`): the run it ends on is the one its CI run's jobs
 *     share, joined rather than opened (./joinTheRun).
 *
 * There is no asking first (operator decision 2026-10-11): CI always runs one job per platform, and
 * a JavaScript-only change finishes in minutes in each without building.
 */
import type { Platform } from '@sherlo/api-types';
import {
  getGitInfo,
  getValidatedCommandParams,
  handleClientError,
  uploadOrReuseBuildsAndRunTests,
} from '../../../helpers';
import getBinariesInfoAndNextBuildIndex from '../../../helpers/getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex';
import { emit } from '../../../helpers/transcriptSink';
import { readProjectJson } from '../../../helpers/projectJson';
import { realFreshBundleEffects } from '../../../helpers/uploadFreshBundles';
import type { PushEffects } from '../../../helpers/uploadOrReuseBuildsAndRunTests';
import type { BaseFingerprintPreimage } from '../../../helpers/fingerprint/baseFingerprint';
import type { AppBuildReason, ChangesSinceStoredBuild } from '../../../render/appBuild';
import type { PlatformRow } from '../../../render/runRows';
import { appBuilder } from '../../../seams/appBuilder';
import { nativeBuild } from '../../../seams/nativeBuild';
import { type OpenBuildRequest, serverCalls } from '../../../seams/serverCalls';
import type { CommandParams, Options } from '../../../types';
import { buildBundles } from '../bundleAndPreview';
import { THIS_COMMAND } from '../constants';
import type { ValidatedModuleManifest } from '../readModuleManifest';
import { collectModuleManifests } from '../stagedRun';
import type { StagedGateRefusal } from '../stagedGateRefusal';
import {
  applyBundleToPlatformConfig,
  realBundleUploadEffects,
  uploadBundles,
} from '../uploadBundles';
import { printPlatformRowInALog } from '../platformRows';
import { buildApps } from './buildApps';
import { type BuildFlags, type BuildSettings, readBuildSettings } from './buildSettings';
import { ciRunKey } from './ciRun';
import { easRun } from './easRun';
import { joinTheRun } from './joinTheRun';
import { foldersStoredFileByFile, nativeChangesSince } from './nativeChanges';

/** Build what the gate refused, then run the standard road on the fresh app builds. */
export async function buildThenPush({
  passedOptions,
  platformsToTest,
  refusals,
  storedBuildIndexOf,
  baseFingerprint,
  fingerprintPreimage,
}: {
  passedOptions: Options<THIS_COMMAND> & BuildFlags;
  platformsToTest: Platform[];
  refusals: StagedGateRefusal[];
  /** Per platform, the test its stored app build was built in, as the gate named it. */
  storedBuildIndexOf: Partial<Record<Platform, number>>;
  baseFingerprint: string;
  /** The sources `baseFingerprint` was computed over - what a stored app build's list is compared with. */
  fingerprintPreimage?: BaseFingerprintPreimage;
}): Promise<{ url: string }> {
  const { platformsToBuild, platformsOnStoredBuild } = whichPlatformsNeedABuild({
    platformsToTest,
    refusals,
  });

  const commandParams = getValidatedCommandParams({ command: THIS_COMMAND, passedOptions });
  const settings = readBuildSettings(commandParams);

  // EAS MODE: the refused platforms are built on Expo's servers, and the run waits for them.
  if (settings.tool === 'eas') {
    return easRun({ commandParams, platforms: platformsToBuild, settings });
  }

  warnAboutVariablesOnExpo(commandParams.projectRoot, settings);

  // A stored platform's row says which test its app build came from; the built ones' rows come
  // from ./buildApps.
  const storedPlatformRows = platformsOnStoredBuild.map((platform) =>
    printPlatformRowInALog({
      platform,
      appBuild: 'reused-from-test',
      testIndex: storedBuildIndexOf[platform],
    })
  );

  const toBuild = await Promise.all(
    refusals.map(async (refusal) => ({
      platform: refusal.platform,
      why: {
        reason: reasonOf(refusal),
        storedBuildIndex: storedBuildIndexOf[refusal.platform],
        ...(await changesSinceStoredBuildOf(
          refusal,
          fingerprintPreimage,
          commandParams.projectRoot
        )),
      },
    }))
  );

  const { appBuildPaths, platformRows } = await buildApps({
    projectRoot: commandParams.projectRoot,
    toBuild,
    settings,
    baseFingerprint,
    cacheDirFlag: passedOptions.buildCache,
    command: 'test',
    project: {
      teamId: commandParams.credential.teamId,
      projectIndex: commandParams.credential.projectIndex,
    },
    storedPlatformRows,
  });

  // THE STANDARD ROAD, ON THE BUILDS JUST MADE: the same validation and the same push spine a
  // developer gets by passing the paths themselves, so nothing below this line knows who built
  // them. A mixed run hands the spine only the built platforms' paths; its config still names
  // every device, so the test's row names the whole test's devices.
  const pushParams = getValidatedCommandParams({
    command: THIS_COMMAND,
    passedOptions: { ...passedOptions, ...appBuildPaths },
  });

  const joinKey = splitRunKeyOf(passedOptions);
  if (!joinKey && platformsOnStoredBuild.length === 0) {
    return uploadOrReuseBuildsAndRunTests({ commandParams: pushParams, platformRows });
  }

  return uploadOrReuseBuildsAndRunTests({
    commandParams: pushParams,
    platformRows,
    effects: pushEffects({
      commandParams: pushParams,
      platformsToBuild,
      platformsOnStoredBuild,
      joinKey,
      platformRows,
    }),
  });
}

/**
 * Which platforms need a new app build and which stay on the app build Sherlo stores: the ones
 * the staged gate refused are built, every other platform the run tests keeps its stored one.
 */
function whichPlatformsNeedABuild({
  platformsToTest,
  refusals,
}: {
  platformsToTest: Platform[];
  refusals: StagedGateRefusal[];
}): { platformsToBuild: Platform[]; platformsOnStoredBuild: Platform[] } {
  const platformsToBuild = refusals.map(({ platform }) => platform);
  return {
    platformsToBuild,
    platformsOnStoredBuild: platformsToTest.filter(
      (platform) => !platformsToBuild.includes(platform)
    ),
  };
}

/**
 * The key a split job joins the run under: only for `--platform`, and only where the CI service
 * (or `--run-id`) names the run. A `--platform` job with no run to name is a test of its own, and
 * says so.
 */
export function splitRunKeyOf(passedOptions: BuildFlags): string | null {
  if (!passedOptions.platform) return null;

  const key = ciRunKey(process.env, passedOptions.runId);
  if (!key) {
    emit({
      kind: 'notice',
      level: 'warning',
      message:
        'No CI run ID was found, so this job runs as a test of its own. ' +
        'Pass the same --run-id <id> to both jobs to join them into one test.',
    });
  }
  return key;
}

/**
 * The push spine's own effects, with two changes it cannot make itself: the binaries read are only
 * the built platforms' (a mixed run has no app build for the other), and the build it ends on
 * carries the stored platforms' fresh bundles too - joined into the CI run's shared run for a split
 * job, opened for anything else.
 *
 * PLAN-LAYER DEBT, NAMED (epic sherlo-test-builds-apps): a copy of the spine's defaults
 * (../../../helpers/uploadOrReuseBuildsAndRunTests), because the spine is outside what plan may
 * edit. The build task teaches the spine both changes and deletes this copy.
 */
function pushEffects({
  commandParams,
  platformsToBuild,
  platformsOnStoredBuild,
  joinKey,
  platformRows,
}: {
  commandParams: CommandParams<THIS_COMMAND>;
  platformsToBuild: Platform[];
  platformsOnStoredBuild: Platform[];
  joinKey: string | null;
  /** The platforms' rows, which a joined run's test row stands under (./joinTheRun). */
  platformRows: PlatformRow[];
}): PushEffects {
  const { token, projectIndex, teamId } = commandParams.credential;
  const machine = nativeBuild();
  // Filled when openBuild stages the stored platforms, read by the test's row after it.
  let storedPlatformManifests: Partial<Record<Platform, ValidatedModuleManifest>> = {};

  return {
    now: () => machine.now(),
    resolveBinaries: async () => {
      const { binariesInfo, nextBuildIndex } = await getBinariesInfoAndNextBuildIndex({
        token,
        command: THIS_COMMAND,
        commandParams,
        projectIndex,
        teamId,
        platforms: platformsToBuild,
        android: commandParams.android,
        ios: commandParams.ios,
      });
      const sdkVersion = binariesInfo.android?.sdkVersion || binariesInfo.ios?.sdkVersion || '';
      return { binariesInfo: { ...binariesInfo, sdkVersion }, nextBuildIndex };
    },
    resolveGitInfo: () =>
      getGitInfo(commandParams.projectRoot, { branchOverride: commandParams.gitBranch }),
    computeFingerprint: () => machine.computeFingerprint(commandParams.projectRoot, THIS_COMMAND),
    openBuild: async (input) => {
      const request = input as OpenBuildRequest;

      if (platformsOnStoredBuild.length > 0) {
        storedPlatformManifests = await stageTheStoredPlatforms({
          request,
          platformsOnStoredBuild,
          commandParams,
        });
      }

      if (joinKey) {
        return joinTheRun({ token, joinKey, platform: platformsToBuild[0], request, platformRows });
      }
      return serverCalls()
        .openBuild({ token, ...request })
        .catch((error) => handleClientError(error, token));
    },
    binaryUpload: {
      readBinary: (buildPath, platform, projectRoot) =>
        machine.readBinaryForUpload(buildPath, platform, projectRoot),
      putBinary: (uploadUrl, data) => machine.putBinary(uploadUrl, data),
    },
    baseRegistration: {
      extractGateMetadataFor: (params) => machine.extractGateMetadataFor(params),
    },
    freshBundle: realFreshBundleEffects(token),
    moduleManifestsOfStoredPlatforms: () => storedPlatformManifests,
  };
}

/**
 * The other half of a mixed run: bundle the platforms whose stored app build still matches, upload
 * each bundle to its staged slot, and put it on the run's config - the stored app build is named by
 * the async-upload placeholder the config already carries for a platform with no binary, and the
 * runner splices the bundle into it, exactly as on the staged road. Answers the stored platforms'
 * module maps, so the test's row counts their stories too.
 */
async function stageTheStoredPlatforms({
  request,
  platformsOnStoredBuild,
  commandParams,
}: {
  request: OpenBuildRequest;
  platformsOnStoredBuild: Platform[];
  commandParams: CommandParams<THIS_COMMAND>;
}): Promise<Partial<Record<Platform, ValidatedModuleManifest>>> {
  const { token, projectIndex, teamId } = commandParams.credential;

  const { results: bundles } = await buildBundles({
    projectRoot: commandParams.projectRoot,
    platformsToTest: platformsOnStoredBuild,
  });

  const stagedKeys = await uploadBundles({
    platformsToTest: platformsOnStoredBuild,
    bundles,
    projectIndex,
    teamId,
    effects: realBundleUploadEffects(token),
  });

  const config = request.buildRunConfig as Record<string, unknown>;
  for (const platform of platformsOnStoredBuild) {
    const platformConfig = config[platform] as Parameters<
      typeof applyBundleToPlatformConfig
    >[0]['platformConfig'];
    const keys = stagedKeys[platform];
    const bundle = bundles[platform];
    if (!platformConfig || !keys || !bundle) continue;

    applyBundleToPlatformConfig({ platformConfig, keys, bundleSizeMb: bundle.bundleSizeMb });
  }

  return collectModuleManifests(bundles, platformsOnStoredBuild);
}

/**
 * A local build borrows the eas.json profile's `env`, and cannot borrow the variables a profile
 * keeps on Expo's servers (`environment`) without an Expo login. Said once, before the build, so a
 * developer whose app needs them knows where to put them.
 */
function warnAboutVariablesOnExpo(projectRoot: string, settings: BuildSettings): void {
  const profileName = settings.easProfile;
  if (!profileName) return;

  // No eas.json, or one that cannot be read: there is nothing to borrow.
  const environment: unknown = readProjectJson(projectRoot, 'eas.json')?.build?.[profileName]
    ?.environment;
  if (typeof environment === 'string') {
    emit({ kind: 'eas-hosted-variables', profile: profileName, environment });
  }
}

/**
 * The gate's refusal, in the developer's words: a refusal that hands back a stored app build's
 * source list, or names what moved, is native code that changed since the stored app build, and
 * one that does neither is a project Sherlo holds no app build for yet - the gate has nothing to
 * compare with.
 *
 * PLAN-LAYER DEBT: a moved base fingerprint whose stored app build kept no list (an older CLI
 * stored it) is refused with an empty diff too, so the gate cannot tell "nothing stored" from
 * "native code changed" there. The build task reads the gate's own reason instead of guessing.
 */
function reasonOf(refusal: StagedGateRefusal): AppBuildReason {
  return refusal.storedBase || refusal.diff.length > 0 ? 'native-changed' : 'nothing-stored';
}

/**
 * What changed since the stored app build, when the gate handed back its source list and this
 * run knows its own: nothing to say otherwise, and the build line gives only its reason. When the
 * stored list keeps a native folder's files, this run hashes its own files in that folder too, so
 * the list names the file that changed rather than the folder.
 */
async function changesSinceStoredBuildOf(
  refusal: StagedGateRefusal,
  fingerprintPreimage: BaseFingerprintPreimage | undefined,
  projectRoot: string
): Promise<{ changesSince?: ChangesSinceStoredBuild }> {
  if (!refusal.storedBase || !fingerprintPreimage) return {};

  const folders = foldersStoredFileByFile(refusal.storedBase);
  const thisRunFolderFiles =
    folders.length > 0 ? await appBuilder().hashNativeFolderFiles({ projectRoot, folders }) : [];

  return {
    changesSince: {
      storedBuildIndex: refusal.storedBase.buildIndex,
      changes: nativeChangesSince(refusal.storedBase, fingerprintPreimage, thisRunFolderFiles),
    },
  };
}
