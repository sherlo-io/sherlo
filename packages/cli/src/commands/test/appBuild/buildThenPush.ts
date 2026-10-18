/**
 * WHERE `sherlo test` USED TO STOP, IT BUILDS - the staged gate said a platform needs a new app
 * build, so the tool builds it here and pushes it down the standard road in the same run.
 *
 * Three shapes of the same push, all on the one push spine (../../../helpers/uploadOrReuseBuildsAndRunTests):
 *
 *   - every platform needs a build: build them all, then the standard road;
 *   - a MIXED run: one platform needs a build and the other can still take the stored app build
 *     (only JavaScript changed there) - the built one is uploaded, the other gets its fresh bundle
 *     spliced into the stored app build, and both are one test - only the platform that needs a
 *     build is built;
 *   - one job of a SPLIT CI run (`--platform`): the test it ends on is the one its CI run's jobs
 *     share, joined rather than opened (./joinTheRun).
 *
 * In EAS mode (`build.tool: "eas"`) a refused platform is built on Expo's servers instead
 * (./easRun), and nothing is compiled here.
 *
 * There is no asking first: CI always runs one job per platform, and
 * a JavaScript-only change finishes in minutes in each without building.
 */
import path from 'path';
import type { Platform } from '@sherlo/api-types';
import { getValidatedCommandParams, uploadOrReuseBuildsAndRunTests } from '../../../helpers';
import { emit } from '../../../helpers/transcriptSink';
import { readProjectJson } from '../../../helpers/projectJson';
import type {
  BaseFingerprintPreimage,
  BaseFingerprints,
} from '../../../helpers/fingerprint/baseFingerprint';
import type { SplitJob } from '../../../helpers/uploadOrReuseBuildsAndRunTests';
import type { WhyANewAppBuild } from '../../../render/appBuild';
import type { Options, PushCredential } from '../../../types';
import { THIS_COMMAND } from '../constants';
import type { StagedGateRefusal } from '../stagedGateRefusal';
import { printPlatformRowInALog } from '../platformRows';
import { buildApps } from './buildApps';
import {
  type BuildFlags,
  type BuildSettings,
  DEFAULT_EAS_PROFILE,
  readBuildSettings,
} from './buildSettings';
import { ciRunKey } from './ciRun';
import { easRun } from './easRun';
import type { AppBuildAccount } from './pushFacts';
import { changesSinceStoredBuild } from './nativeChanges';

/** Build what the gate refused, then run the standard road on the fresh app builds. */
export async function buildThenPush({
  passedOptions,
  platformsToTest,
  refusals,
  storedBuildIndexOf,
  fingerprints,
  credential,
}: {
  passedOptions: Options<THIS_COMMAND> & BuildFlags;
  /** The credential the run already resolved, so this road does not resolve (and trade) it again. */
  credential: PushCredential;
  platformsToTest: Platform[];
  refusals: StagedGateRefusal[];
  /** Per platform, the test its stored app build was built in, as the gate named it. */
  storedBuildIndexOf: Partial<Record<Platform, number>>;
  /**
   * Each platform's base fingerprint, and the sources it was computed over - what a stored app
   * build's list is compared with.
   */
  fingerprints: BaseFingerprints;
}): Promise<{ url: string }> {
  const platformsToBuild = refusals.map(({ platform }) => platform);
  const platformsOnStoredBuild = platformsToTest.filter(
    (platform) => !platformsToBuild.includes(platform)
  );

  const commandParams = await getValidatedCommandParams({
    command: THIS_COMMAND,
    passedOptions,
    resolvedCredential: credential,
  });
  const settings = readBuildSettings(commandParams);

  // EAS MODE: the refused platforms are built on Expo's servers, and the run waits for them.
  if (settings.tool === 'eas') {
    return easRun({
      commandParams,
      platforms: platformsToBuild,
      settings,
      runIdFlag: passedOptions.runId,
      // The fingerprint the gate was asked with travels to Expo's machine in the hand-over file:
      // prebuild and the build write into the project there, so one taken there is no base.
      fingerprints,
    });
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
      why: await whyANewAppBuild({
        refusal,
        storedBuildIndex: storedBuildIndexOf[refusal.platform],
        fingerprintPreimage: fingerprints[refusal.platform].preimage,
        projectRoot: commandParams.projectRoot,
      }),
    }))
  );

  const { appBuildPaths, platformRows, madeBy } = await buildApps({
    projectRoot: commandParams.projectRoot,
    toBuild,
    settings,
    fingerprints,
    cacheDirFlag: passedOptions.buildCache,
    parallelBuildsFlag: passedOptions.parallelBuilds,
    command: 'test',
    project: {
      teamId: commandParams.credential.teamId,
      projectIndex: commandParams.credential.projectIndex,
    },
    storedPlatformRows,
  });

  // THE STANDARD ROAD, ON THE BUILDS JUST MADE: the push spine takes the app builds as they are,
  // the stored platforms of a mixed run, and the split job's join, so nothing below this line
  // knows who built them.
  const splitJob = splitJobOf(passedOptions);
  return uploadOrReuseBuildsAndRunTests({
    commandParams,
    appBuildPaths: resolvedFrom(commandParams.projectRoot, appBuildPaths),
    // The fingerprint the gate was asked with, taken before the build: a build writes into the
    // project, so one taken now would not be the base the next push computes.
    fingerprints,
    platformsOnStoredBuild,
    ...(splitJob ? { splitJob } : {}),
    platformRows,
    appBuilds: appBuildAccountsOf(toBuild, madeBy),
    runIdFlag: passedOptions.runId,
  });
}

/** What the push reports about each app build it made or took from the cache: how, and why a new one. */
function appBuildAccountsOf(
  toBuild: Array<{ platform: Platform; why: WhyANewAppBuild }>,
  madeBy: Partial<Record<Platform, AppBuildAccount['madeBy']>>
): Partial<Record<Platform, AppBuildAccount>> {
  const accounts: Partial<Record<Platform, AppBuildAccount>> = {};
  for (const { platform, why } of toBuild) {
    const madeByThisPlatform = madeBy[platform];
    if (madeByThisPlatform) accounts[platform] = { madeBy: madeByThisPlatform, why };
  }
  return accounts;
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

/** This job of a split CI run - its key and its platform - or nothing for a test of its own. */
function splitJobOf(passedOptions: BuildFlags): SplitJob | undefined {
  const joinKey = splitRunKeyOf(passedOptions);
  if (!joinKey) return undefined;
  return { joinKey, platform: passedOptions.platform as Platform };
}

/** Each app build's path, from the project root when the builder named it relative to it. */
function resolvedFrom(
  projectRoot: string,
  appBuildPaths: Partial<Record<Platform, string>>
): Partial<Record<Platform, string>> {
  return Object.fromEntries(
    Object.entries(appBuildPaths).map(([platform, appBuildPath]) => [
      platform,
      path.resolve(projectRoot, appBuildPath),
    ])
  );
}

/**
 * A local build borrows the eas.json profile's `env`, and cannot borrow the variables a profile
 * keeps on Expo's servers (`environment`) without an Expo login. Said once, before the build, so a
 * developer whose app needs them knows where to put them - the build goes on.
 */
function warnAboutVariablesOnExpo(projectRoot: string, settings: BuildSettings): void {
  const profileName = settings.easProfile ?? DEFAULT_EAS_PROFILE;

  // No eas.json, or one that cannot be read: there is nothing to borrow.
  const environment: unknown = readProjectJson(projectRoot, 'eas.json')?.build?.[profileName]
    ?.environment;
  if (typeof environment === 'string') {
    emit({ kind: 'eas-hosted-variables', profile: profileName, environment });
  }
}

/**
 * Why a refused platform needs a new app build, in the developer's words. Only a change of native
 * code since a stored app build is a reason worth a word (`native code changed since Test 12`),
 * and the gate says there is one by naming the test that stored app build came from. A platform
 * with nothing stored gives no reason at all.
 */
async function whyANewAppBuild({
  refusal,
  storedBuildIndex,
  fingerprintPreimage,
  projectRoot,
}: {
  refusal: StagedGateRefusal;
  /** The test the stored app build came from, as the gate named it; none when nothing is stored. */
  storedBuildIndex: number | undefined;
  fingerprintPreimage: BaseFingerprintPreimage | undefined;
  projectRoot: string;
}): Promise<WhyANewAppBuild> {
  const storedIn = storedBuildIndex ?? refusal.storedBase?.buildIndex;
  if (storedIn === undefined) return { reason: 'nothing-stored' };

  return {
    reason: 'native-changed',
    storedBuildIndex: storedIn,
    ...(await changesSinceStoredBuild({
      storedBase: refusal.storedBase,
      fingerprintPreimage,
      projectRoot,
    })),
  };
}
