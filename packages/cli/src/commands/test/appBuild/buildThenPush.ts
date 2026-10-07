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
 * `--no-build` keeps the old answer: `native-needed=true`, nothing built, exit 4 - the question a
 * CI pipeline asks first on a cheap Linux job, so a JavaScript-only change never starts a Mac.
 */
import fs from 'fs';
import path from 'path';
import type { Platform } from '@sherlo/api-types';
import {
  getGitInfo,
  getValidatedCommandParams,
  handleClientError,
  uploadOrReuseBuildsAndRunTests,
} from '../../../helpers';
import getBinariesInfoAndNextBuildIndex from '../../../helpers/getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex';
import { emit } from '../../../helpers/transcriptSink';
import { realFreshBundleEffects } from '../../../helpers/uploadFreshBundles';
import type { PushEffects } from '../../../helpers/uploadOrReuseBuildsAndRunTests';
import type { AppBuildReason } from '../../../render/appBuild';
import { nativeBuild } from '../../../seams/nativeBuild';
import { type OpenBuildRequest, serverCalls } from '../../../seams/serverCalls';
import type { CommandParams, Options } from '../../../types';
import { buildBundles } from '../bundleAndPreview';
import { THIS_COMMAND } from '../constants';
import type { StagedGateRefusal } from '../stagedGateRefusal';
import { applyBundleToPlatformConfig, realBundleUploadEffects, uploadBundles } from '../uploadBundles';
import { buildApps } from './buildApps';
import { type BuildFlags, type BuildSettings, readBuildSettings } from './buildSettings';
import { ciRunKey } from './ciRun';
import { easRun } from './easRun';
import { joinTheRun } from './joinTheRun';

/** Build what the gate refused, then run the standard road on the fresh app builds. */
export async function buildThenPush({
  passedOptions,
  platformsToTest,
  refusals,
  baseFingerprint,
}: {
  passedOptions: Options<THIS_COMMAND> & BuildFlags;
  platformsToTest: Platform[];
  refusals: StagedGateRefusal[];
  baseFingerprint: string;
}): Promise<{ url: string }> {
  const refused = refusals.map(({ platform }) => platform);
  const stored = platformsToTest.filter((platform) => !refused.includes(platform));

  for (const platform of stored) {
    emit({ kind: 'app-build-stored-reused', platform });
  }

  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: false }
  );
  const settings = readBuildSettings(commandParams);

  // EAS MODE: the refused platforms are built on Expo's servers, and the run waits for them.
  if (settings.tool === 'eas') {
    return easRun({ commandParams, platforms: refused, settings });
  }

  warnAboutVariablesOnExpo(commandParams.projectRoot, settings);

  const builtPaths = await buildApps({
    projectRoot: commandParams.projectRoot,
    toBuild: refusals.map((refusal) => ({ platform: refusal.platform, reason: reasonOf(refusal) })),
    settings,
    baseFingerprint,
    cacheDirFlag: passedOptions.buildCache,
    savedToCache: false,
  });

  // THE STANDARD ROAD, ON THE BUILDS JUST MADE: the same validation and the same push spine a
  // developer gets by passing the paths themselves, so nothing below this line knows who built
  // them. A mixed run hands the spine only the built platforms' paths; its config still names
  // every device, so the run header counts the whole test.
  const pushParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions: { ...passedOptions, ...builtPaths } },
    { requirePlatformPaths: stored.length === 0 }
  );

  const joinKey = splitRunKeyOf(passedOptions);
  if (!joinKey && stored.length === 0) {
    return uploadOrReuseBuildsAndRunTests({ commandParams: pushParams });
  }

  return uploadOrReuseBuildsAndRunTests({
    commandParams: pushParams,
    effects: pushEffects({ commandParams: pushParams, built: refused, stored, joinKey }),
  });
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
  built,
  stored,
  joinKey,
}: {
  commandParams: CommandParams<THIS_COMMAND>;
  built: Platform[];
  stored: Platform[];
  joinKey: string | null;
}): PushEffects {
  const { token, projectIndex, teamId } = commandParams.credential;
  const machine = nativeBuild();

  return {
    now: () => machine.now(),
    resolveBinaries: async () => {
      const { binariesInfo, nextBuildIndex } = await getBinariesInfoAndNextBuildIndex({
        token,
        command: THIS_COMMAND,
        commandParams,
        projectIndex,
        teamId,
        platforms: built,
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

      if (stored.length > 0) await stageTheStoredPlatforms({ request, stored, commandParams });

      if (joinKey) {
        return joinTheRun({ token, joinKey, platform: built[0], request });
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
  };
}

/**
 * The other half of a mixed run: bundle the platforms whose stored app build still matches, upload
 * each bundle to its staged slot, and put it on the run's config - the stored app build is named by
 * the async-upload placeholder the config already carries for a platform with no binary, and the
 * runner splices the bundle into it, exactly as on the staged road.
 */
async function stageTheStoredPlatforms({
  request,
  stored,
  commandParams,
}: {
  request: OpenBuildRequest;
  stored: Platform[];
  commandParams: CommandParams<THIS_COMMAND>;
}): Promise<void> {
  const { token, projectIndex, teamId } = commandParams.credential;

  const { results: bundles } = await buildBundles({
    projectRoot: commandParams.projectRoot,
    platformsToTest: stored,
  });

  const stagedKeys = await uploadBundles({
    platformsToTest: stored,
    bundles,
    projectIndex,
    teamId,
    effects: realBundleUploadEffects(token),
  });

  const config = request.buildRunConfig as Record<string, unknown>;
  for (const platform of stored) {
    const platformConfig = config[platform] as Parameters<typeof applyBundleToPlatformConfig>[0]['platformConfig'];
    const keys = stagedKeys[platform];
    const bundle = bundles[platform];
    if (!platformConfig || !keys || !bundle) continue;

    applyBundleToPlatformConfig({ platformConfig, keys, bundleSizeMb: bundle.bundleSizeMb });
  }
}

/**
 * A local build borrows the eas.json profile's `env`, and cannot borrow the variables a profile
 * keeps on Expo's servers (`environment`) without an Expo login. Said once, before the build, so a
 * developer whose app needs them knows where to put them.
 */
function warnAboutVariablesOnExpo(projectRoot: string, settings: BuildSettings): void {
  const profileName = settings.easProfile;
  if (!profileName) return;

  let environment: unknown;
  try {
    const easJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'eas.json'), 'utf8'));
    environment = easJson.build?.[profileName]?.environment;
  } catch {
    return; // No eas.json, or one that cannot be read: there is nothing to borrow.
  }

  if (typeof environment === 'string') {
    emit({ kind: 'eas-hosted-variables', profile: profileName, environment });
  }
}

/**
 * The gate's refusal, in the developer's words: a refusal that names what moved is native code
 * that changed since the stored app build, and one that names nothing is a project Sherlo holds no
 * app build for yet - the gate has nothing to compare with.
 *
 * PLAN-LAYER DEBT: a moved base fingerprint is refused with an empty diff too, so today the gate
 * cannot tell "nothing stored" from "native code changed". The build task gives the gate's answer
 * a field that says no base is stored, and this reads it instead of the empty diff.
 */
function reasonOf(refusal: StagedGateRefusal): AppBuildReason {
  return refusal.diff.length > 0 ? 'native-changed' : 'nothing-stored';
}
